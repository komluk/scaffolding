#!/usr/bin/env bash
# refactor-guard.sh — PreToolUse hook on Edit|Write|MultiEdit and Bash `sed -i` / `perl -pi`.
# DENY by default (v2.30.0): when a change (incl. sed -i via xargs / $(...)) renames/removes an exported
# symbol and the session transcript shows no earlier LSP findReferences (on a file defining it) or
# graphify query on it, returns permissionDecision "deny" with exact next steps. Falls back to a
# non-blocking warning when no LSP server covers the language. Always exits 0. No deps beyond python3.
# SCAFFOLDING_REFACTOR_GUARD=warn -> warn only; =off -> disabled. Logic: hooks/lib/refactor_guard.py.
[ "${SCAFFOLDING_REFACTOR_GUARD:-}" = "off" ] && exit 0
INPUT=$(cat 2>/dev/null)
# Cheap prefilter: a Bash call that mentions neither sed nor perl cannot be an in-place edit.
case "$INPUT" in
    *'"tool_name":"Bash"'*|*'"tool_name": "Bash"'*) case "$INPUT" in *sed*|*perl*) ;; *) exit 0 ;; esac ;;
esac
printf '%s' "$INPUT" | python3 -I "$(dirname "${BASH_SOURCE[0]}")/lib/refactor_guard.py" 2>/dev/null
exit 0
