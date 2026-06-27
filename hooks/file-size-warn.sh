#!/usr/bin/env bash
# PostToolUse hook (matcher: Write): Warn when a written file exceeds 500 lines.
# WARN-ONLY: always exit 0, NEVER blocks. Read-only — does not mutate the file,
# so it cannot change file mtime and is safe to run alongside the staleness pipeline.

set +e

# Reason: try/except yields empty string on malformed JSON so the hook exits 0.
FILE_PATH=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null)

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
