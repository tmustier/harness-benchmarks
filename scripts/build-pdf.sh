#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INPUT="$ROOT/site/index.html"
OUTPUT="$ROOT/site/harness-benchmarks.pdf"

if [[ ! -f "$INPUT" ]]; then
  node "$ROOT/scripts/build-site.mjs"
fi

if command -v google-chrome >/dev/null 2>&1; then
  CHROME="$(command -v google-chrome)"
elif command -v chromium >/dev/null 2>&1; then
  CHROME="$(command -v chromium)"
elif [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
else
  echo "Install Google Chrome or Chromium to build the PDF." >&2
  exit 1
fi

"$CHROME" \
  --headless \
  --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf="$OUTPUT" \
  "file://$INPUT"

echo "Built $OUTPUT"
