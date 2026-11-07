#!/usr/bin/env bash
# PreToolUse hook: Block git push with --force, -f, or --force-with-lease.
# Exit 2 = abort (block the tool call), Exit 0 = allow.

set -euo pipefail

# Node is the JSON helper (hooks/lib/hook-io.mjs). Without it the hook cannot decide: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, block-force-push not enforced" >&2; exit 0; }

# Reason: hook-io yields an empty string on malformed JSON so hook exits 0
# (allow) instead of exit 1 (warn-but-proceed) which would let the op execute.
CMD=$(node "$LIB/hook-io.mjs" get tool_input.command)

# Only check git push commands
if ! echo "$CMD" | grep -q 'git push'; then
    exit 0
fi

# Block --force, --force-with-lease, or standalone -f flag
if echo "$CMD" | grep -qE '(--force-with-lease|--force)\b'; then
    echo "BLOCKED: Force push is not allowed. Remove --force or --force-with-lease flag." >&2
    exit 2
fi

# Reason: Match -f anywhere in a combined flag group (e.g. -fu, -uf) not just standalone.
if echo "$CMD" | grep -qE '(^| )-[a-zA-Z]*f'; then
    echo "BLOCKED: Force push (-f) is not allowed." >&2
    exit 2
fi

exit 0
