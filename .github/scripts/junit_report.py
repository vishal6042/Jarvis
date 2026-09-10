#!/usr/bin/env python3
"""Aggregate every JUnit XML this build produced into one report.

Surefire (the Maven services) and Gradle (the Android app) both write JUnit XML,
which is the format every CI tool already reads - so the raw files ship as-is and
this script adds the three things a release needs on top of them: one merged
`<testsuites>` document, a readable HTML report, and a markdown summary for the
release body and the job summary.

Exits non-zero when anything failed, so the workflow can refuse to publish.
"""

import argparse
import glob
import html
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

# Which build produced a given XML file, worked out from its path.
COMPONENTS = [
    ("Android app", ("android",)),
    ("Backend services", ("services", "surefire")),
]


def component_of(path):
    parts = {p.lower() for p in path.replace("\\", "/").split("/")}
    for name, markers in COMPONENTS:
        if parts & set(markers):
            return name
    return "Other"


def module_of(path):
    """The Maven module or Gradle project a report belongs to, from its path."""
    parts = path.replace("\\", "/").split("/")
    for anchor in ("surefire-reports", "test-results"):
        if anchor in parts:
            index = parts.index(anchor)
            for candidate in reversed(parts[:index]):
                if candidate not in ("target", "build", "test", ".", ""):
                    return candidate
    return parts[-2] if len(parts) > 1 else "unknown"


class Case:
    def __init__(self, suite, element):
        self.suite = suite
        self.classname = element.get("classname", "")
        self.name = element.get("name", "")
        self.time = float(element.get("time") or 0)
        self.status = "passed"
        self.detail = ""
        for tag, status in (("failure", "failed"), ("error", "errored"), ("skipped", "skipped")):
            found = element.find(tag)
            if found is not None:
                self.status = status
                self.detail = ((found.get("message") or "") + "\n" + (found.text or "")).strip()
                break


class Suite:
    def __init__(self, path, element):
        self.path = path
        self.component = component_of(path)
        self.module = module_of(path)
        self.name = element.get("name", os.path.basename(path))
        self.time = float(element.get("time") or 0)
        self.cases = [Case(self.name, tc) for tc in element.iter("testcase")]

    def count(self, status):
        return sum(1 for c in self.cases if c.status == status)

    @property
    def total(self):
        return len(self.cases)

    @property
    def bad(self):
        return self.count("failed") + self.count("errored")


def collect(roots):
    suites = []
    for root in roots:
        for path in sorted(glob.glob(os.path.join(root, "**", "*.xml"), recursive=True)):
            if os.path.basename(path).startswith("TESTS-"):
                continue  # Surefire's own aggregate; its testsuites are already counted.
            try:
                tree = ET.parse(path)
            except ET.ParseError:
                continue
            node = tree.getroot()
            found = [node] if node.tag == "testsuite" else list(node.iter("testsuite"))
            for element in found:
                suite = Suite(path, element)
                if suite.total:
                    suites.append(suite)
    return suites


def totals(suites):
    return {
        "suites": len(suites),
        "tests": sum(s.total for s in suites),
        "passed": sum(s.count("passed") for s in suites),
        "failed": sum(s.count("failed") for s in suites),
        "errored": sum(s.count("errored") for s in suites),
        "skipped": sum(s.count("skipped") for s in suites),
        "time": sum(s.time for s in suites),
    }


def write_merged(suites, path):
    root = ET.Element("testsuites", {"name": "Jarvis"})
    for suite in suites:
        element = ET.SubElement(
            root,
            "testsuite",
            {
                "name": suite.module + "." + suite.name,
                "tests": str(suite.total),
                "failures": str(suite.count("failed")),
                "errors": str(suite.count("errored")),
                "skipped": str(suite.count("skipped")),
                "time": "%.3f" % suite.time,
            },
        )
        for case in suite.cases:
            node = ET.SubElement(
                element,
                "testcase",
                {"classname": case.classname, "name": case.name, "time": "%.3f" % case.time},
            )
            if case.status in ("failed", "errored"):
                tag = "failure" if case.status == "failed" else "error"
                ET.SubElement(node, tag).text = case.detail
            elif case.status == "skipped":
                ET.SubElement(node, "skipped")
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def write_markdown(suites, path, version):
    agg = totals(suites)
    broken_count = agg["failed"] + agg["errored"]
    verdict = "All tests passed" if broken_count == 0 else "Tests failed"
    mark = ":white_check_mark:" if broken_count == 0 else ":x:"
    lines = [
        "## Test results",
        "",
        "%s **%s** - %d/%d passing across %d suites in %.1fs."
        % (mark, verdict, agg["passed"], agg["tests"], agg["suites"], agg["time"]),
        "",
        "| Component | Tests | Passed | Failed | Errors | Skipped | Time |",
        "|---|--:|--:|--:|--:|--:|--:|",
    ]
    for component in sorted({s.component for s in suites}):
        sub = totals([s for s in suites if s.component == component])
        lines.append(
            "| %s | %d | %d | %d | %d | %d | %.1fs |"
            % (
                component,
                sub["tests"],
                sub["passed"],
                sub["failed"],
                sub["errored"],
                sub["skipped"],
                sub["time"],
            )
        )
    lines.append(
        "| **Total** | **%d** | **%d** | **%d** | **%d** | **%d** | **%.1fs** |"
        % (
            agg["tests"],
            agg["passed"],
            agg["failed"],
            agg["errored"],
            agg["skipped"],
            agg["time"],
        )
    )
    lines.append("")

    broken = [(s, c) for s in suites for c in s.cases if c.status in ("failed", "errored")]
    if broken:
        lines += ["<details><summary>Failing tests</summary>", ""]
        for suite, case in broken:
            lines.append("- `%s.%s` (%s)" % (case.classname, case.name, suite.module))
            first = case.detail.splitlines()[0] if case.detail else ""
            if first:
                lines.append("  - " + first[:300])
        lines += ["", "</details>", ""]

    lines.append(
        "Full report: `jarvis-%s-test-report.html` in the assets below, with the raw JUnit XML "
        "in `jarvis-%s-test-reports.zip`." % (version, version)
    )
    lines.append("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


CSS = """
:root { color-scheme: light dark; --bg:#ffffff; --fg:#16181d; --muted:#5c6470; --line:#e3e6ea;
        --card:#f7f8fa; --ok:#177245; --bad:#b3261e; --skip:#8a6d00; --accent:#2f5fd0; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#14161a; --fg:#e8eaee; --muted:#99a1ad; --line:#2a2e35; --card:#1b1e24;
          --ok:#4ec98a; --bad:#ff8a80; --skip:#e0b64a; --accent:#7aa2f7; }
}
* { box-sizing: border-box; }
body { margin:0; padding:32px 20px 64px; background:var(--bg); color:var(--fg);
       font:15px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.wrap { max-width: 1040px; margin: 0 auto; }
h1 { font-size:26px; margin:0 0 4px; letter-spacing:-0.01em; }
h2 { font-size:18px; margin:36px 0 12px; }
.sub { color:var(--muted); margin:0 0 22px; font-size:14px; }
.verdict { display:inline-block; padding:6px 14px; border-radius:999px; font-weight:600;
           font-size:14px; margin-bottom:22px; }
.verdict.ok  { background:rgba(23,114,69,.14); color:var(--ok); }
.verdict.bad { background:rgba(179,38,30,.14); color:var(--bad); }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; }
.tile { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
.tile .n { font-size:24px; font-weight:650; letter-spacing:-0.02em; }
.tile .l { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
.tile.bad .n { color:var(--bad); } .tile.ok .n { color:var(--ok); } .tile.skip .n { color:var(--skip); }
.scroll { overflow-x:auto; }
table { border-collapse:collapse; width:100%; font-size:14px; }
th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
th { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:600; }
td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
tbody tr:hover { background:var(--card); }
.name { white-space:normal; font-family:ui-monospace, Consolas, monospace; font-size:13px; }
.pill { font-size:11px; font-weight:650; padding:2px 8px; border-radius:999px; }
.pill.passed { background:rgba(23,114,69,.14); color:var(--ok); }
.pill.failed, .pill.errored { background:rgba(179,38,30,.14); color:var(--bad); }
.pill.skipped { background:rgba(138,109,0,.16); color:var(--skip); }
pre { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px;
      overflow-x:auto; font-size:12.5px; margin:8px 0 0; white-space:pre-wrap; }
details { border:1px solid var(--line); border-radius:8px; padding:10px 14px; margin-bottom:10px;
          background:var(--card); }
summary { cursor:pointer; font-weight:600; }
footer { margin-top:44px; padding-top:16px; border-top:1px solid var(--line);
         color:var(--muted); font-size:13px; }
a { color:var(--accent); }
"""


def write_html(suites, path, version, tag, repo, run_url):
    agg = totals(suites)
    broken_count = agg["failed"] + agg["errored"]
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    esc = html.escape

    parts = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
        "<meta name='viewport' content='width=device-width,initial-scale=1'>",
        "<title>Jarvis %s - test report</title>" % esc(version),
        "<style>%s</style></head><body><div class='wrap'>" % CSS,
        "<h1>Jarvis %s - test report</h1>" % esc(version),
        "<p class='sub'>Tag <code>%s</code> &middot; %s &middot; generated %s</p>"
        % (esc(tag), esc(repo), stamp),
    ]
    if broken_count:
        parts.append(
            "<div class='verdict bad'>%d failing of %d tests</div>" % (broken_count, agg["tests"])
        )
    else:
        parts.append("<div class='verdict ok'>All %d tests passed</div>" % agg["tests"])

    parts.append("<div class='tiles'>")
    tiles = [
        ("Tests", agg["tests"], ""),
        ("Passed", agg["passed"], "ok"),
        ("Failed", agg["failed"], "bad" if agg["failed"] else ""),
        ("Errors", agg["errored"], "bad" if agg["errored"] else ""),
        ("Skipped", agg["skipped"], "skip" if agg["skipped"] else ""),
        ("Duration", "%.1fs" % agg["time"], ""),
    ]
    for label, value, cls in tiles:
        parts.append(
            "<div class='tile %s'><div class='n'>%s</div><div class='l'>%s</div></div>"
            % (cls, value, label)
        )
    parts.append("</div>")

    parts.append("<h2>By suite</h2><div class='scroll'><table><thead><tr>")
    parts.append(
        "<th>Component</th><th>Module</th><th>Suite</th><th class='n'>Tests</th>"
        "<th class='n'>Passed</th><th class='n'>Failed</th><th class='n'>Skipped</th>"
        "<th class='n'>Time</th></tr></thead><tbody>"
    )
    ordered = sorted(suites, key=lambda s: (s.component, s.module, s.name))
    for suite in ordered:
        parts.append(
            "<tr><td>%s</td><td>%s</td><td class='name'>%s</td><td class='n'>%d</td>"
            "<td class='n'>%d</td><td class='n'>%d</td><td class='n'>%d</td>"
            "<td class='n'>%.2fs</td></tr>"
            % (
                esc(suite.component),
                esc(suite.module),
                esc(suite.name),
                suite.total,
                suite.count("passed"),
                suite.bad,
                suite.count("skipped"),
                suite.time,
            )
        )
    parts.append("</tbody></table></div>")

    broken = [(s, c) for s in suites for c in s.cases if c.status in ("failed", "errored")]
    if broken:
        parts.append("<h2>Failures</h2>")
        for suite, case in broken:
            parts.append(
                "<details open><summary>%s.%s <span class='pill %s'>%s</span></summary>"
                "<pre>%s</pre></details>"
                % (
                    esc(case.classname),
                    esc(case.name),
                    case.status,
                    case.status,
                    esc(case.detail or "no detail reported"),
                )
            )

    parts.append("<h2>Every test</h2><div class='scroll'><table><thead><tr>")
    parts.append("<th>Test</th><th>Suite</th><th>Status</th><th class='n'>Time</th></tr></thead><tbody>")
    for suite in ordered:
        for case in suite.cases:
            parts.append(
                "<tr><td class='name'>%s</td><td>%s</td>"
                "<td><span class='pill %s'>%s</span></td><td class='n'>%.3fs</td></tr>"
                % (esc(case.name), esc(suite.name), case.status, case.status, case.time)
            )
    parts.append("</tbody></table></div>")

    link = "<a href='%s'>workflow run</a>" % esc(run_url) if run_url else "the release workflow"
    parts.append(
        "<footer>JUnit XML from Maven Surefire and Gradle, merged by the Jarvis release "
        "workflow. Produced by %s.</footer></div></body></html>" % link
    )
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("".join(parts))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("roots", nargs="+", help="directories to scan for JUnit XML")
    ap.add_argument("--version", required=True)
    ap.add_argument("--tag", default="")
    ap.add_argument("--repo", default="")
    ap.add_argument("--run-url", default="")
    ap.add_argument("--html")
    ap.add_argument("--markdown")
    ap.add_argument("--merged")
    ap.add_argument("--fail-on-failure", action="store_true")
    args = ap.parse_args()

    suites = collect(args.roots)
    if not suites:
        raise SystemExit("no JUnit XML found - the test jobs produced nothing to report on")

    agg = totals(suites)
    if args.html:
        write_html(suites, args.html, args.version, args.tag, args.repo, args.run_url)
    if args.markdown:
        write_markdown(suites, args.markdown, args.version)
    if args.merged:
        write_merged(suites, args.merged)

    print(
        "%d tests in %d suites: %d passed, %d failed, %d errored, %d skipped"
        % (
            agg["tests"],
            agg["suites"],
            agg["passed"],
            agg["failed"],
            agg["errored"],
            agg["skipped"],
        )
    )
    if args.fail_on_failure and agg["failed"] + agg["errored"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
