#!/usr/bin/env bash
# PreToolUse hook: Block destructive rm -rf on critical paths.
# Exit 2 = abort (block the tool call), Exit 0 = allow.

set -euo pipefail

# Node is the JSON helper (hooks/lib/hook-io.mjs). Without it the hook cannot decide: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, block-destructive-rm not enforced" >&2; exit 0; }

# Reason: hook-io yields an empty command on malformed JSON so hook exits 0
# (allow) instead of exit 1 (warn-but-proceed) which would let the op execute.
# ONE node process returns both the command and the first protected rm target,
# NUL-terminated: "<command>\0<target or empty>\0". The flag analysis stays in bash.
CMD=""
BLOCKED=""
{ IFS= read -r -d '' CMD; IFS= read -r -d '' BLOCKED; } < <(node "$LIB/hook-io.mjs" rm-target) || true

# Reason: Block piped-to-rm patterns (xargs rm, xargs -I{} rm, etc.)
# before the main rm flag analysis, since these bypass flag detection.
if echo "$CMD" | grep -qE 'xargs\s+(-[^\s]*\s+)*rm\b'; then
    echo "BLOCKED: Piping to rm via xargs is not allowed." >&2
    exit 2
fi

# Only check rm commands
if ! echo "$CMD" | grep -q 'rm '; then
    exit 0
fi

# Reason: Independently detect recursive AND force flags anywhere in the command.
# This catches combined flags (-rf, -fr), separated flags (-r -f), long flags
# (--recursive --force), and any mix thereof.
HAS_RECURSIVE=false
HAS_FORCE=false

# Check for -r/-R in combined short flags or standalone, or --recursive
if echo "$CMD" | grep -qE '(^| )-[a-zA-Z]*[rR]'; then
    HAS_RECURSIVE=true
fi
if echo "$CMD" | grep -qE '(^| )--recursive( |$)'; then
    HAS_RECURSIVE=true
fi

# Check for -f in combined short flags or standalone, or --force
if echo "$CMD" | grep -qE '(^| )-[a-zA-Z]*f'; then
    HAS_FORCE=true
fi
if echo "$CMD" | grep -qE '(^| )--force( |$)'; then
    HAS_FORCE=true
fi

# Not a destructive rm unless both recursive and force are present
if ! $HAS_RECURSIVE || ! $HAS_FORCE; then
    exit 0
fi

# Reason: protected targets ('/', '.', '..', '/etc', '/var', '/usr' and anything below them)
# are matched as exact strings / path prefixes by `hook-io.mjs rm-target` above (no regex, so no
# escaping issues with paths like '/.'). BLOCKED holds the first match, or is empty.

if [ -n "$BLOCKED" ]; then
    echo "BLOCKED: Destructive rm -rf on '$BLOCKED' is not allowed." >&2
    exit 2
fi

exit 0
