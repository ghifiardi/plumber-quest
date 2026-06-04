#!/usr/bin/env bash
# Headless test runner for the in-browser harness.
# Requires the project's shot server running on :8011 (serves the repo root and
# accepts POST /shot). Prints "PASS n / FAIL m" + any ❌ failure lines.
set -u
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RESULT=/tmp/reveal/testresult.txt
rm -f "$RESULT"
"$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$(mktemp -d)" \
  "http://localhost:8011/tests/index.html?post=1&cb=$RANDOM" >/dev/null 2>&1 &
CPID=$!
for i in $(seq 1 20); do [ -f "$RESULT" ] && break; sleep 1; done
kill "$CPID" 2>/dev/null || true
if [ ! -f "$RESULT" ]; then echo "NO RESULT — is the :8011 shot server up?"; exit 1; fi
head -1 "$RESULT"
grep "❌" "$RESULT" || true
