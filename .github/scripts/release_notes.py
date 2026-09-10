#!/usr/bin/env python3
"""Render the GitHub Release body for a Jarvis tag.

Walks the commits between the previous tag and this one, files each commit under
the part of the product it touched (the area owning the most changed files
wins), and prints the result as markdown. The asset table and the test summary
are handed in by the workflow rather than derived here.
"""

import argparse
import collections
import subprocess

# First match wins per file, so keep the narrow prefixes above the broad ones.
AREAS = [
    ("Corpus & financial guidance (RAG)", ("corpus/", "scripts/rag/")),
    ("Backend services", ("services/",)),
    ("Web app", ("frontend/",)),
    ("Android app", ("android/",)),
    ("Desktop Control Center", ("desktop/",)),
    ("Tooling, CI & docs", (".github/", "scripts/", "assets/", "README.md", "start-jarvis")),
]
OTHER = "Other changes"
MAX_PER_AREA = 15
MAX_COMMITS = 60


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def previous_tag(tag):
    """The nearest tag reachable from this tag's parent, or '' for the first release."""
    done = subprocess.run(
        ["git", "describe", "--tags", "--abbrev=0", f"{tag}^"], capture_output=True, text=True
    )
    return done.stdout.strip() if done.returncode == 0 else ""


def area_of(sha):
    files = [f for f in git("show", "--pretty=", "--name-only", sha).splitlines() if f.strip()]
    votes = collections.Counter()
    for path in files:
        for name, prefixes in AREAS:
            if path.startswith(prefixes):
                votes[name] += 1
                break
    return votes.most_common(1)[0][0] if votes else OTHER


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--date", required=True)
    ap.add_argument("--repo", required=True, help="owner/name")
    ap.add_argument("--assets-file", help="markdown table of the attached files")
    ap.add_argument("--tests-file", help="markdown summary of the test run")
    ap.add_argument("--out", help="write here as UTF-8 instead of printing")
    args = ap.parse_args()

    prev = previous_tag(args.tag)
    rev_range = f"{prev}..{args.tag}" if prev else args.tag
    commits = [
        line.split("\x1f")
        for line in git("log", "--no-merges", "--format=%H%x1f%h%x1f%s", rev_range).splitlines()
        if line.strip()
    ]

    total = len(commits)
    shown = commits[:MAX_COMMITS]

    grouped = collections.OrderedDict((name, []) for name, _ in AREAS)
    grouped[OTHER] = []
    for sha, short, subject in shown:
        grouped[area_of(sha)].append((sha, short, subject))

    out = []
    out.append(f"**Jarvis {args.version}** — built from `{args.tag}` on {args.date}.")
    out.append("")
    out.append(
        "Self-hosted personal finance assistant: Spring Boot microservices, a React PWA, "
        "an Android SMS forwarder and a Windows Control Center, all built from this tag."
    )
    out.append("")

    out.append("## What changed")
    out.append("")
    if prev:
        out.append(
            f"{total} commit{'s' if total != 1 else ''} since "
            f"[`{prev}`](https://github.com/{args.repo}/releases/tag/{prev}) "
            f"([full diff](https://github.com/{args.repo}/compare/{prev}...{args.tag}))."
        )
    else:
        out.append(f"First tagged release. {total} commits of history behind it.")
    out.append("")

    empty = True
    for name, entries in grouped.items():
        if not entries:
            continue
        empty = False
        out.append(f"### {name}")
        out.append("")
        for sha, short, subject in entries[:MAX_PER_AREA]:
            out.append(f"- {subject} ([`{short}`](https://github.com/{args.repo}/commit/{sha}))")
        if len(entries) > MAX_PER_AREA:
            out.append(f"- …and {len(entries) - MAX_PER_AREA} more in this area")
        out.append("")
    if empty:
        out.append("_No commits found in this range._")
        out.append("")
    if total > MAX_COMMITS:
        out.append(f"_Showing the {MAX_COMMITS} most recent of {total} commits._")
        out.append("")

    if args.tests_file:
        out.append(read(args.tests_file))
    if args.assets_file:
        out.append(read(args.assets_file))

    out.append("## Installing")
    out.append("")
    out.append(
        "1. **Backend** — needs JDK 21 and PostgreSQL 18. Drop the `*.jar` files from "
        "`jarvis-services-*.zip` somewhere and start them in the order listed in "
        "`services/services.json` (Eureka first, gateway last), or just run "
        "`services/start-all.ps1` from a checkout of this tag."
    )
    out.append(
        "2. **Web app** — `jarvis-web-*.zip` is a static build; serve it behind any web server, or "
        "let the Control Center run the dev server."
    )
    out.append(
        "3. **Desktop** — run `Jarvis Control Center Setup *.exe` (Windows x64). It starts, watches "
        "and restarts the whole stack from one window."
    )
    out.append(
        "4. **Android** — sideload the `.apk` onto a phone on the same LAN, then point it at "
        "`http://<PC-LAN-IP>:8080`. It is not on the Play Store: the SMS permissions it needs "
        "are not grantable there."
    )
    out.append("")
    out.append(
        "> These builds are unsigned beyond the Android debug key. Windows SmartScreen and "
        "Android's installer will both warn you; that is expected for a self-hosted personal build."
    )

    body = "\n".join(out)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(body)
    else:
        print(body)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read().rstrip() + "\n"


if __name__ == "__main__":
    main()
