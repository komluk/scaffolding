#!/usr/bin/env bash
# refactor-guard.sh — PreToolUse hook on Edit|Write|MultiEdit and Bash `sed -i` / `perl -pi`.
# WARN mode only (v2.29.0): when a change renames/removes an exported symbol and the session
# transcript shows no earlier LSP findReferences (same file) or graphify query on it, injects a
# non-blocking additionalContext warning. Never denies; always exits 0. No deps beyond python3.
# Disable: SCAFFOLDING_REFACTOR_GUARD=off. Logic: hooks/lib/refactor_guard.py.
[ "${SCAFFOLDING_REFACTOR_GUARD:-}" = "off" ] && exit 0
INPUT=$(cat 2>/dev/null)
# Cheap prefilter: a Bash call that mentions neither sed nor perl cannot be an in-place edit.
case "$INPUT" in
    *'"tool_name":"Bash"'*|*'"tool_name": "Bash"'*) case "$INPUT" in *sed*|*perl*) ;; *) exit 0 ;; esac ;;
esac
printf '%s' "$INPUT" | python3 -I "$(dirname "${BASH_SOURCE[0]}")/lib/refactor_guard.py" 2>/dev/null
exit 0
