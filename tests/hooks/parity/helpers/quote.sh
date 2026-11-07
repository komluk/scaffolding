#!/usr/bin/env bash
# Parity helper: JSON-quote stdin (what memory-project-id.sh / auto-init-check.sh do with their context string).
# Recording (HOOKS_DIR = the python hooks, no lib/hook-io.mjs): the python one-liner of v2.34.0. Comparing: hook-io quote.
if [ -f "$HOOKS_DIR/lib/hook-io.mjs" ]; then
  node "$HOOKS_DIR/lib/hook-io.mjs" quote
else
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
fi
