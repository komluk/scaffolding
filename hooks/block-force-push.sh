#!/usr/bin/env bash
# PreToolUse hook (Bash): Block force pushes and remote deletion of main/master.
# Exit 2 = abort (block the tool call), Exit 0 = allow.
# Blocks --force / --force-with-lease / --force-if-includes, -f in any short-flag group (-uf), a +refspec,
# --mirror, and --delete / -d / :branch on main or master. Sees git global options (-c, -C, --no-pager),
# every line, wrappers (sudo, env) and bash -c. Decision logic: hooks/lib/guards.mjs (pushGuard).

set -uo pipefail

INPUT=$(cat)
# Fast path: no "push" / git alias config, and no quote, backslash, $, ` or glob that could split one.
shopt -s nocasematch
RE=$'push|alias\\.|autocorrect|[\\\\\'\`$*?[]|\\{[^"}[:space:]]'
[[ "$INPUT" =~ $RE ]] || exit 0

# Node is the JSON helper (hooks/lib/hook-io.mjs). Without it the hook cannot decide: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, block-force-push not enforced" >&2; exit 0; }

# Malformed JSON or a non-string field -> no message -> allow (exit 0, never exit 1 = warn-but-proceed).
# node itself failing (crash, out of memory, killed) after the fast path matched -> block: fail closed.
MSG=$(printf '%s' "$INPUT" | node "$LIB/hook-io.mjs" guard push); RC=$?
if [ "$RC" -ne 0 ]; then
    echo "BLOCKED: block-force-push could not check this command (node exited $RC). Retry, or split the command." >&2
    exit 2
fi
if [ -n "$MSG" ]; then
    printf '%s\n' "$MSG" >&2
    exit 2
fi
exit 0
