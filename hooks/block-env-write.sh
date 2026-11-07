#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit and Bash): Block writes to .env / .env.* files (case-insensitive).
# Exit 2 = abort (block the tool call), Exit 0 = allow.
# Edit/Write: the basename of tool_input.file_path. Bash: redirects (> >> >| &> 2>), tee, cp/mv/install
# destinations, sed -i and perl -i, on every line and inside bash -c / sudo / env wrappers.
# Decision logic: hooks/lib/guards.mjs (envWriteGuard).

set -uo pipefail

INPUT=$(cat)
# Fast path: nothing that could spell .env: no "env", no ".e" / ".<glob>", no quote, backslash, $, ` or glob.
shopt -s nocasematch
RE=$'env|\\.[e*?[{]|[\\\\\'\`$*?[]|\\{[^"}[:space:]]'
[[ "$INPUT" =~ $RE ]] || exit 0

# Node is the JSON helper (hooks/lib/hook-io.mjs). Without it the hook cannot decide: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, block-env-write not enforced" >&2; exit 0; }

# Malformed JSON or a non-string field -> no message -> allow (exit 0, never exit 1 = warn-but-proceed).
# node itself failing (crash, out of memory, killed) after the fast path matched -> block: fail closed.
MSG=$(printf '%s' "$INPUT" | node "$LIB/hook-io.mjs" guard env); RC=$?
if [ "$RC" -ne 0 ]; then
    echo "BLOCKED: block-env-write could not check this command (node exited $RC). Retry, or split the command." >&2
    exit 2
fi
if [ -n "$MSG" ]; then
    printf '%s\n' "$MSG" >&2
    exit 2
fi
exit 0
