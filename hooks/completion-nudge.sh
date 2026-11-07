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

# Opt-in gate — no-op fast-path when not enabled (checked first: no node process in the default state).
MODE="${SCAFFOLDING_COMPLETION_NUDGE:-}"
if [ -z "$MODE" ]; then
    exit 0
fi

LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, completion-nudge skipped" >&2; exit 0; }

CHECKLIST="Completion check before yielding:
  - Did you actually run the tests, or just assume they pass?
  - Did validation pass (the pre-commit-validation hook runs at git commit — let it run; do not bypass it)?
  - Is the task truly complete, or only partially done?
  - Any BLOCKED items left unreported?"

# Loop guard (mandatory): if the stop was already triggered by a prior hook pass, do nothing. This is
# what makes a block-mode nudge fire at most once. ONE node process does the guard (and, in block mode,
# the JSON emit: hook-io emit-block --guard reads "<stdin JSON>\0<reason>").
case "$MODE" in
    block)
        # Strict mode: force one more turn. The guard makes this fire at most once (the
        # re-prompt's Stop event has stop_hook_active set true).
        REASON="$CHECKLIST"
        printf '%s\0%s' "$INPUT" "$REASON" | node "$LIB/hook-io.mjs" emit-block --guard stop_hook_active 2>/dev/null
        exit 0
        ;;
    *)
        # Advisory mode (=1 or any other non-empty value): never blocks.
        STOP_ACTIVE=$(printf '%s' "$INPUT" | node "$LIB/hook-io.mjs" get --bool stop_hook_active 2>/dev/null)
        [ "$STOP_ACTIVE" = "true" ] && exit 0
        printf '%s\n' "$CHECKLIST" >&2
        exit 0
        ;;
esac
