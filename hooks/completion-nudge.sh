#!/usr/bin/env bash
# completion-nudge.sh — optional Stop hook.
#
# Before the agent yields, surfaces a short completion-verification checklist so
# work isn't reported done prematurely. References the existing
# pre-commit-validation hook rather than re-running tests — stays cheap (no
# network, no test execution, sub-millisecond).
#
# Loop prevention: reads `stop_hook_active` from the Stop event stdin JSON. When
# true (the stop was already triggered by a prior hook pass), the hook exits 0
# immediately — this makes infinite loops impossible.
#
# Modes (opt-in, same gating style as notify.sh):
#   unset                            -> fast-path no-op, exit 0
#   SCAFFOLDING_COMPLETION_NUDGE=1   -> advisory: checklist to stderr, exit 0 (never blocks)
#   SCAFFOLDING_COMPLETION_NUDGE=block -> strict: emit {"decision":"block",...} once, exit 0
#
# Always exits 0.

set +e

# Read the Stop event payload from stdin (may be empty).
INPUT=$(cat 2>/dev/null)

# Loop guard (mandatory): if the stop was already triggered by a prior hook pass,
# do nothing. This is what makes a block-mode nudge fire at most once.
STOP_ACTIVE=$(printf '%s' "$INPUT" | python3 -c \
    'import json,sys
try:
    d = json.load(sys.stdin)
    print("true" if d.get("stop_hook_active") else "false")
except Exception:
    print("false")' 2>/dev/null)

if [ "$STOP_ACTIVE" = "true" ]; then
    exit 0
fi

# Opt-in gate — no-op fast-path when not enabled.
MODE="${SCAFFOLDING_COMPLETION_NUDGE:-}"
if [ -z "$MODE" ]; then
    exit 0
fi

CHECKLIST="Completion check before yielding:
  - Did you actually run the tests, or just assume they pass?
  - Did validation pass (the pre-commit-validation hook runs at git commit — let it run; do not bypass it)?
  - Is the task truly complete, or only partially done?
  - Any BLOCKED items left unreported?"

case "$MODE" in
    block)
        # Strict mode: force one more turn. stop_hook_active guard above ensures
        # this fires at most once (the re-prompt's Stop event has it set true).
        REASON="$CHECKLIST"
        printf '%s' "$REASON" | python3 -c \
            'import json,sys
print(json.dumps({"decision": "block", "reason": sys.stdin.read()}))' 2>/dev/null
        exit 0
        ;;
    *)
        # Advisory mode (=1 or any other non-empty value): never blocks.
        printf '%s\n' "$CHECKLIST" >&2
        exit 0
        ;;
esac
