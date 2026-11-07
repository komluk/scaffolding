#!/usr/bin/env bash
# PreToolUse hook: Block writes to .env files.
# Exit 2 = abort (block the tool call), Exit 0 = allow.

set -euo pipefail

# Node is the JSON helper (hooks/lib/hook-io.mjs). Without it the hook cannot decide: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, block-env-write not enforced" >&2; exit 0; }

# Reason: hook-io yields empty strings on malformed JSON so hook exits 0
# (allow) instead of exit 1 (warn-but-proceed) which would let the op execute.
# Output file_path (for Edit/Write) and command (for Bash), one per line.
TOOL_INPUT=$(node "$LIB/hook-io.mjs" get tool_input.file_path tool_input.command)

FILE_PATH=$(echo "$TOOL_INPUT" | head -1)
CMD=$(echo "$TOOL_INPUT" | tail -1)

# Check Edit/Write tool: block if file_path targets .env
if [ -n "$FILE_PATH" ]; then
    BASENAME=$(basename "$FILE_PATH")
    # Block if basename is exactly ".env" or starts with ".env."
    if [ "$BASENAME" = ".env" ] || echo "$BASENAME" | grep -q '^\.env\.'; then
        echo "BLOCKED: Writing to $BASENAME is not allowed. Environment files must be edited manually." >&2
        exit 2
    fi
fi

# Check Bash tool: block commands that redirect output to .env files
# Reason: Catch patterns like "echo ... > .env", "cat ... > .env", "tee .env"
if [ -n "$CMD" ]; then
    if echo "$CMD" | grep -qE '(>|>>)\s*\.env(\s|$|\.)|tee\s+(-a\s+)?\.env(\s|$|\.)'; then
        echo "BLOCKED: Writing to .env via shell redirect/tee is not allowed. Environment files must be edited manually." >&2
        exit 2
    fi
fi

exit 0
