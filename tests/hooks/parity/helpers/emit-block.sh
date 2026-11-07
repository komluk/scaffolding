#!/usr/bin/env bash
# Parity helper: {"decision":"block","reason":<stdin>} (completion-nudge.sh / memory-ingest.sh block mode).
# Recording: the python one-liner of v2.34.0. Comparing: hook-io emit-block.
if [ -f "$HOOKS_DIR/lib/hook-io.mjs" ]; then
  node "$HOOKS_DIR/lib/hook-io.mjs" emit-block
else
  python3 -c 'import json,sys
print(json.dumps({"decision": "block", "reason": sys.stdin.read()}))'
fi
