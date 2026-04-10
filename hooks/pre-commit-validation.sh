#!/bin/bash
# Pre-Commit Hook: Run validation before git commit
#
# Graceful runtime-detect variant (scaffolding).
# Skips silently when tools/venv/package.json are not present.
#
# Detects:
#  - frontend: package.json with "validate" script, runs `npm run validate`
#  - python backend: venv in venv/ .venv/ app/backend/venv/ backend/venv/
#  - .NET: dotnet CLI + .cs/.csproj files

set -e

echo ""
echo "Running pre-commit validation..."
echo ""

# --- Frontend ---
if [ -f "package.json" ] && grep -q '"validate"' package.json 2>/dev/null; then
    if git diff --cached --name-only | grep -qE '\.(ts|tsx|js|jsx|css|scss|json)$'; then
        echo "[frontend] running npm run validate..."
        if npm run validate; then
            echo "[frontend] validation passed"
        else
            echo "[frontend] validation failed -- fix errors before committing" >&2
            exit 1
        fi
    fi
elif [ -d "frontend" ] && [ -f "frontend/package.json" ] && grep -q '"validate"' frontend/package.json 2>/dev/null; then
    if git diff --cached --name-only | grep -q "^frontend/"; then
        echo "[frontend] running validation in frontend/..."
        (cd frontend && npm run validate) || { echo "[frontend] validation failed" >&2; exit 1; }
        echo "[frontend] validation passed"
    fi
fi

# --- Python backend (runtime-detect venv) ---
if git diff --cached --name-only | grep -qE '\.py$'; then
    VENV=""
    for candidate in venv .venv app/backend/venv backend/venv; do
        if [ -f "$candidate/bin/activate" ]; then
            VENV="$candidate"
            break
        fi
    done

    if [ -n "$VENV" ]; then
        echo "[python] venv detected at $VENV"
        # shellcheck disable=SC1090
        source "$VENV/bin/activate"
        if command -v pytest >/dev/null 2>&1; then
            pytest || { echo "[python] tests failed -- fix before committing" >&2; exit 1; }
            echo "[python] tests passed"
        else
            echo "[python] pytest not found in $VENV -- skipping"
        fi
    else
        echo "[python] no venv detected in known locations -- skipping"
    fi
fi

# --- .NET backend ---
if git diff --cached --name-only | grep -qE '\.(cs|csproj|sln)$'; then
    if command -v dotnet >/dev/null 2>&1; then
        echo "[dotnet] running build..."
        if dotnet build; then
            echo "[dotnet] build passed"
        else
            echo "[dotnet] build failed" >&2
            exit 1
        fi
        if dotnet test; then
            echo "[dotnet] tests passed"
        else
            echo "[dotnet] tests failed" >&2
            exit 1
        fi
    else
        echo "[dotnet] dotnet CLI not found -- skipping"
    fi
fi

echo ""
echo "All applicable validation checks passed."
echo ""

exit 0
