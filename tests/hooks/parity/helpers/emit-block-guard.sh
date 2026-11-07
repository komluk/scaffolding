#!/usr/bin/env bash
# Parity helper: the Stop-hook loop guard + block emit. stdin = the reason, $GUARD_JSON = the Stop event payload.
# Recording: the two python snippets of v2.34.0 (guard, then json.dumps). Comparing: hook-io emit-block --guard.
if [ -f "$HOOKS_DIR/lib/hook-io.mjs" ]; then
  { printf '%s\0' "$GUARD_JSON"; cat; } | node "$HOOKS_DIR/lib/hook-io.mjs" emit-block --guard stop_hook_active
else
  STOP_ACTIVE=$(printf '%s' "$GUARD_JSON" | python3 -c \
    'import json,sys
try:
    d = json.load(sys.stdin)
    print("true" if d.get("stop_hook_active") else "false")
except Exception:
    print("false")')
  [ "$STOP_ACTIVE" = "true" ] && exit 0
  python3 -c 'import json,sys
print(json.dumps({"decision": "block", "reason": sys.stdin.read()}))'
fi
