"""Extract readable text from a saved ITD page, keeping table structure intact.

Tax content is table-shaped: a deduction row (section, nature, who can claim) only
means anything as a row. So cells are joined with tabs and rows with newlines,
which is also what the live page's innerText gave us -- the two routes agree.
"""
import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

# Only tags that actually close. A void element here (meta, link) would raise the
# skip depth and never lower it, silently swallowing the whole document.
SKIP = {"script", "style", "noscript", "head", "svg"}
BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article"}


class Extract(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.skip_depth = 0
        self.in_cell = False

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip_depth += 1
        elif tag in ("td", "th"):
            self.in_cell = True
            self.out.append("\t")
        elif tag == "tr":
            self.out.append("\n")
        elif tag in BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip_depth:
            self.skip_depth -= 1
        elif tag in ("td", "th"):
            self.in_cell = False
        elif tag in ("tr", "table"):
            self.out.append("\n")
        elif tag in BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if self.skip_depth:
            return
        s = re.sub(r"[ \t\xa0]+", " ", data)
        if s.strip():
            self.out.append(s if self.in_cell else s.strip())

    def text(self):
        t = "".join(self.out)
        t = re.sub(r"[ \xa0]{2,}", " ", t)
        t = re.sub(r"\n\s*\n\s*\n+", "\n\n", t)          # collapse blank runs
        t = "\n".join(line.rstrip() for line in t.splitlines())
        return t.strip()


src = Path(sys.argv[1])
dst = Path(sys.argv[2])
p = Extract()
p.feed(html.unescape(src.read_text(encoding="utf-8", errors="replace")))
text = p.text()
dst.write_text(text, encoding="utf-8")

cells = text.count("\t")
acts = re.findall(r"Finance Act, ?20[0-9]{2}", text)[:3]
ays = re.findall(r"A\.?Y\.? ?20[0-9]{2}-[0-9]{2}", text)[:3]
print(f"  chars={len(text)}  words={len(text.split())}  lines={len(text.splitlines())}  cells={cells}")
print(f"  Finance Act: {acts}")
print(f"  AY: {ays}")
