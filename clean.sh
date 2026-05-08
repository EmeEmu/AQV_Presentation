#!/usr/bin/env bash
set -euo pipefail

HTML="${1:-index.html}"
ASSETS_DIR="${2:-assests}"

python3 - "$HTML" "$ASSETS_DIR" <<'PY'
import os
import re
import sys
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

html_file = Path(sys.argv[1]).resolve()
assets_dir = Path(sys.argv[2]).resolve()

asset_exts = {".png", ".svg", ".mp4"}

with open(html_file, "r", encoding="utf-8", errors="ignore") as f:
    html = f.read()

references = set()

class RefParser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if not value:
                continue

            # srcset can contain multiple URLs
            if name.lower() == "srcset":
                for part in value.split(","):
                    url = part.strip().split()[0]
                    references.add(url)
            else:
                references.add(value)

parser = RefParser()
parser.feed(html)

# Also catch inline CSS: url(...)
for match in re.findall(r"url\(([^)]+)\)", html, flags=re.I):
    references.add(match.strip("'\" "))

resolved_refs = set()

for ref in references:
    ref = ref.strip()
    if not ref:
        continue

    # Ignore external URLs and data URIs
    if ref.startswith(("http://", "https://", "//", "data:", "mailto:", "tel:", "#")):
        continue

    # Remove query strings and fragments
    path = urlsplit(ref).path
    path = unquote(path)

    if not path:
        continue

    if path.startswith("/"):
        # Treat root-relative paths as relative to the HTML directory
        candidate = html_file.parent / path.lstrip("/")
    else:
        candidate = html_file.parent / path

    resolved_refs.add(candidate.resolve())

for root, _, files in os.walk(assets_dir):
    for filename in files:
        asset = Path(root) / filename

        if asset.suffix.lower() not in asset_exts:
            continue

        if asset.resolve() not in resolved_refs:
            # NUL-separated output, safe for spaces/newlines in filenames
            sys.stdout.buffer.write(str(asset).encode("utf-8") + b"\0")
PY
