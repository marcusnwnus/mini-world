#!/usr/bin/env python3
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(__file__))
SOURCE = os.path.join(ROOT, "src", "sky-data.js")
OUT = os.path.join(ROOT, "assets", "sky.webp")

with open(SOURCE, "r", encoding="utf-8") as f:
    text = f.read()

match = re.search(r'data:image/webp;base64,([A-Za-z0-9+/=]+)', text)
if not match:
    raise SystemExit("Could not find embedded WebP sky data")

data = base64.b64decode(match.group(1), validate=True)
if not data.startswith(b"RIFF") or b"WEBP" not in data[:16]:
    raise SystemExit("Decoded sky data is not a valid WebP")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "wb") as f:
    f.write(data)

print(f"Built {OUT} ({len(data)} bytes)")
