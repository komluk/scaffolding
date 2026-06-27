#!/usr/bin/env bash
# post-edit-format.sh — PostToolUse(Edit|Write) auto-formatter.
#
# Runtime-detects a formatter for the single edited file and formats ONLY that
# file. Best-effort and cosmetic: skips silently when no formatter is present,
# swallows formatter errors, and ALWAYS exits 0 (never blocks an edit).
#
# CRITICAL ORDERING: this hook MUST run BEFORE file-staleness-update.sh in the
# PostToolUse(Edit|Write) array. It mutates the file (bumping its mtime), so
# staleness-update must record the POST-format mtime — otherwise the next edit's
# PreToolUse staleness-check sees a mismatch and falsely blocks with "modified
# externally". Keep file-staleness-update.sh LAST.
#
# Opt-in: gated behind SCAFFOLDING_AUTOFORMAT=1 (default off for first release).

# Never let anything in here fail the hook.
set +e

# Opt-in gate — no-op fast-path when not enabled.
if [ "${SCAFFOLDING_AUTOFORMAT:-}" != "1" ]; then
    exit 0
fi

# Read tool input from stdin.
INPUT=$(cat)

# Extract file_path using python3 (no jq dependency) — same pattern as
# file-staleness-update.sh.
FILE_PATH=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.argv[1])
    ti = data.get('tool_input', data)
    print(ti.get('file_path', ''))
except Exception:
    print('')
" "$INPUT" 2>/dev/null)

# Skip if no file path extracted or file doesn't exist.
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
    exit 0
fi

ext="${FILE_PATH##*.}"

format_python() {
    # Prefer a project venv's ruff/black, then PATH.
    local venv_bin=""
    for candidate in venv .venv app/backend/venv backend/venv; do
        if [ -x "$candidate/bin/ruff" ] || [ -x "$candidate/bin/black" ]; then
            venv_bin="$candidate/bin"
            break
        fi
    done
    if [ -n "$venv_bin" ] && [ -x "$venv_bin/ruff" ]; then
        "$venv_bin/ruff" format "$FILE_PATH" >/dev/null 2>&1 && return 0
    fi
    if command -v ruff >/dev/null 2>&1; then
        ruff format "$FILE_PATH" >/dev/null 2>&1 && return 0
    fi
    if [ -n "$venv_bin" ] && [ -x "$venv_bin/black" ]; then
        "$venv_bin/black" "$FILE_PATH" >/dev/null 2>&1 && return 0
    fi
    if command -v black >/dev/null 2>&1; then
        black "$FILE_PATH" >/dev/null 2>&1 && return 0
    fi
    return 0  # no formatter -> silent skip
}

format_prettier() {
    # Local node_modules bin first, then npx without installing.
    if [ -x "node_modules/.bin/prettier" ]; then
        node_modules/.bin/prettier --write "$FILE_PATH" >/dev/null 2>&1 && return 0
    fi
    if command -v npx >/dev/null 2>&1; then
        npx --no-install prettier --write "$FILE_PATH" >/dev/null 2>&1 && return 0
    fi
    return 0  # no prettier -> silent skip
}

format_dotnet() {
    if command -v dotnet >/dev/null 2>&1; then
        dotnet format --include "$FILE_PATH" >/dev/null 2>&1 && return 0
    fi
    return 0  # no dotnet -> silent skip
}

case "$ext" in
    py)
        format_python
        ;;
    ts|tsx|js|jsx|json|css|scss)
        format_prettier
        ;;
    cs)
        format_dotnet
        ;;
    *)
        : # no formatter for this extension -> skip
        ;;
esac

exit 0
