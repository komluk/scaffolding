#!/usr/bin/env bash
# PostToolUse hook (matcher: Write): Warn when a written file exceeds 500 lines.
# WARN-ONLY: always exit 0, NEVER blocks. Read-only — does not mutate the file,
# so it cannot change file mtime and is safe to run alongside the staleness pipeline.

set +e

# Node is the JSON helper (hooks/lib/hook-io.mjs). Without it the hook cannot decide: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, file-size-warn not enforced" >&2; exit 0; }

# Reason: hook-io yields an empty string on malformed JSON so the hook exits 0.
FILE_PATH=$(node "$LIB/hook-io.mjs" get tool_input.file_path 2>/dev/null)

# Skip silently if no path or the file is missing.
[ -n "$FILE_PATH" ] || exit 0
[ -f "$FILE_PATH" ] || exit 0

# Skip binary files silently (grep -I treats binary as non-matching).
grep -Iq . "$FILE_PATH" 2>/dev/null || exit 0

LINE_COUNT=$(wc -l < "$FILE_PATH" 2>/dev/null | tr -d ' ')
[ -n "$LINE_COUNT" ] || exit 0

if [ "$LINE_COUNT" -gt 500 ] 2>/dev/null; then
    echo "ADVISORY: $FILE_PATH has $LINE_COUNT lines, which exceeds the 500-line guideline. Consider splitting it into smaller modules." >&2
fi

exit 0
