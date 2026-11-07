#!/usr/bin/env bash
# PreToolUse hook (Bash): Block destructive rm -rf / find -delete on protected paths, and rm fed by xargs.
# Exit 2 = abort (block the tool call), Exit 0 = allow.
# Protected (after ~ / $HOME expansion and path normalisation): / and /*, /etc /var /usr (and below),
# /home /root /boot /opt /srv /bin /sbin /lib*, $HOME and its top-level entries, . and .. (any depth), .git.
# Sees every line, quoting, \rm, /bin/rm, sudo/env/command wrappers, bash -c and xargs.
# Decision logic: hooks/lib/guards.mjs (rmGuard).

set -uo pipefail

INPUT=$(cat)
# Fast path: none of rm / unlink / -delete / shred / truncate, and no quote, backslash, $, ` or glob that could hide one.
shopt -s nocasematch
RE=$'(^|[^a-z])(rm|unlink|shred|truncate)([^a-z]|$)|-delete|[\\\\\'\`$*?[]|\\{[^"}[:space:]]'
[[ "$INPUT" =~ $RE ]] || exit 0

# Node is the JSON helper (hooks/lib/hook-io.mjs). Without it the hook cannot decide: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, block-destructive-rm not enforced" >&2; exit 0; }

# Malformed JSON or a non-string field -> no message -> allow (exit 0, never exit 1 = warn-but-proceed).
# node itself failing (crash, out of memory, killed) after the fast path matched -> block: fail closed.
MSG=$(printf '%s' "$INPUT" | node "$LIB/hook-io.mjs" guard rm); RC=$?
if [ "$RC" -ne 0 ]; then
    echo "BLOCKED: block-destructive-rm could not check this command (node exited $RC). Retry, or split the command." >&2
    exit 2
fi
if [ -n "$MSG" ]; then
    printf '%s\n' "$MSG" >&2
    exit 2
fi
exit 0
