#!/usr/bin/env bash
# PreToolUse hook (matcher: Task): Block denylisted subagent types.
# Exit 2 = block the tool call, Exit 0 = allow.
# Denylist is EXACT-match only: general-purpose, explore.
# scaffolding:<agent> and all other custom agents are allowed.

set +e

# Reason: try/except yields empty string on malformed JSON so the hook exits 0
# (allow) rather than exit 1 (warn-but-proceed). Read tool_input.subagent_type.
SUBAGENT_TYPE=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('subagent_type', ''))
except Exception:
    print('')
" 2>/dev/null)

case "$SUBAGENT_TYPE" in
  general-purpose|explore)
    echo "BLOCKED: subagent_type '$SUBAGENT_TYPE' is denylisted by the scaffolding protocol. Use a scaffolding:<agent> (e.g. scaffolding:developer, scaffolding:analyst) instead. 'general-purpose' conflicts with the custom agents; 'explore' is for quick file searches only, never planning/analysis." >&2
    exit 2
    ;;
esac

exit 0
