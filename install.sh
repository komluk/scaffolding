#!/usr/bin/env bash
# install.sh -- claude-scaffolding installer
# Renders __CLAUDE_SCAFFOLDING_*__ placeholder files into a target directory.
# Idempotent: re-running with same ~/.claude-scaffolding.env produces identical output.
#
# Exit codes:
#   0 ok (including --dry-run)
#   1 env validation failed (missing python3/git)
#   2 unreplaced placeholder found after rendering
#   3 I/O error writing target
#   4 invalid CLI arguments

set -euo pipefail

CLAUDE_SCAFFOLDING_ROOT="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${HOME}/.claude-scaffolding.env"
TARGET=""
DRY_RUN=false
REFRESH=false

usage() {
  cat <<EOF
Usage: install.sh [--target PATH] [--refresh] [--dry-run] [--help]

Options:
  --target PATH   Where to render files (default: in-place in repo)
  --refresh       Re-render using values from ~/.claude-scaffolding.env (no prompts)
  --dry-run       Show what would be done, don't touch files
  --help          This help

Exit codes: 0 ok, 1 env, 2 missed placeholder, 3 io, 4 args
EOF
}

# --- parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --refresh) REFRESH=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "[error] unknown arg: $1" >&2; usage; exit 4 ;;
  esac
done

# --- validate env ---
command -v python3 >/dev/null || { echo "[error] python3 required" >&2; exit 1; }
command -v git >/dev/null || { echo "[error] git required" >&2; exit 1; }

# --- determine target ---
if [[ -z "$TARGET" ]]; then
  TARGET="$CLAUDE_SCAFFOLDING_ROOT"
  echo "[info] no --target, rendering in place: $TARGET"
fi

# --- load or prompt config ---
declare -A CONFIG

load_config_from_file() {
  if [[ -f "$CONFIG_FILE" ]]; then
    while IFS='=' read -r k v; do
      [[ -z "$k" || "$k" =~ ^# ]] && continue
      CONFIG["$k"]="$v"
    done < "$CONFIG_FILE"
  fi
}

prompt_for() {
  local key="$1" desc="$2" default_val="$3"

  # Auto-detect hooks per variable (only if no default from config file)
  if [[ -z "${CONFIG[$key]:-}" ]]; then
    case "$key" in
      CLAUDE_SCAFFOLDING_TEST_BACKEND_CMD)
        for venv in venv .venv app/backend/venv backend/venv; do
          if [[ -f "$venv/bin/activate" ]]; then
            default_val="source $venv/bin/activate && pytest"
            break
          fi
        done ;;
      CLAUDE_SCAFFOLDING_TEST_FRONTEND_CMD)
        if [[ -f "package.json" ]] && grep -q '"validate"' package.json 2>/dev/null; then
          default_val="npm run validate"
        elif [[ -f "tsconfig.json" ]]; then
          default_val="npx tsc --noEmit"
        fi ;;
      CLAUDE_SCAFFOLDING_SONAR_PROJECT_KEY)
        if [[ -f ".sonarlint/connectedMode.json" ]]; then
          default_val="$(python3 -c 'import json; print(json.load(open(".sonarlint/connectedMode.json"))["projectKey"])' 2>/dev/null || echo '')"
        fi ;;
      CLAUDE_SCAFFOLDING_PROJECT_NAME)
        default_val="$(basename "$PWD")" ;;
    esac
  fi

  # Read from terminal (even when stdin is piped, for --target /tmp type runs)
  if [[ -t 0 ]]; then
    read -r -p "$desc [$default_val]: " val
  else
    val=""
  fi
  CONFIG["$key"]="${val:-$default_val}"
}

if $REFRESH; then
  load_config_from_file
  if [[ ${#CONFIG[@]} -eq 0 ]]; then
    echo "[error] --refresh but $CONFIG_FILE missing or empty" >&2
    exit 1
  fi
  echo "[info] refresh mode: using values from $CONFIG_FILE"
else
  load_config_from_file  # pre-fill from file, user can accept with enter
  prompt_for CLAUDE_SCAFFOLDING_TEST_BACKEND_CMD "Backend test command" "${CONFIG[CLAUDE_SCAFFOLDING_TEST_BACKEND_CMD]:-echo '[claude-scaffolding] no backend tests configured' && true}"
  prompt_for CLAUDE_SCAFFOLDING_TEST_FRONTEND_CMD "Frontend validate command" "${CONFIG[CLAUDE_SCAFFOLDING_TEST_FRONTEND_CMD]:-echo '[claude-scaffolding] no frontend validation configured' && true}"
  prompt_for CLAUDE_SCAFFOLDING_SONAR_PROJECT_KEY "SonarQube project key (empty to skip)" "${CONFIG[CLAUDE_SCAFFOLDING_SONAR_PROJECT_KEY]:-}"
  prompt_for CLAUDE_SCAFFOLDING_SCHEMAS_DIR "OpenSpec schemas dir" "${CONFIG[CLAUDE_SCAFFOLDING_SCHEMAS_DIR]:-./.scaffolding/openspec/schemas}"
  prompt_for CLAUDE_SCAFFOLDING_PROJECT_NAME "Project name" "${CONFIG[CLAUDE_SCAFFOLDING_PROJECT_NAME]:-$(basename "$PWD")}"
  prompt_for CLAUDE_SCAFFOLDING_BACKEND_EXAMPLE_PATH "Example backend feature path" "${CONFIG[CLAUDE_SCAFFOLDING_BACKEND_EXAMPLE_PATH]:-app/backend/app/feature/}"

  # --- persist config ---
  if ! $DRY_RUN; then
    {
      echo "# claude-scaffolding config -- generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      for k in "${!CONFIG[@]}"; do
        echo "$k=${CONFIG[$k]}"
      done
    } > "$CONFIG_FILE"
    chmod 600 "$CONFIG_FILE"
    echo "[ok] saved config to $CONFIG_FILE"
  fi
fi

# --- files that contain placeholders (rendered with substitution in-place in target) ---
TEMPLATES=(
  "CLAUDE.md"
  "settings.json"
  "agents/architect.md"
  "agents/developer.md"
  "agents/reviewer.md"
  "skills/spec-design/SKILL.md"
  "skills/spec-develop/SKILL.md"
  "commands/init-openspec.md"
)

# Top-level items to copy from repo to target (when target differs)
COPY_ITEMS=(
  "agents"
  "skills"
  "commands"
  "hooks"
  "templates"
  "validators"
  "output-styles"
  "workflows"
  "CLAUDE.md"
  "settings.json"
)

# Normalize path-like entries: strip trailing slash so templates that append
# `/filename` (e.g. `__CLAUDE_SCAFFOLDING_BACKEND_EXAMPLE_PATH__/service.py`) render
# with a single slash regardless of whether the user supplied `./backend` or
# `./backend/`. Reason: template uses explicit `/` separator, so any trailing
# slash in the value would produce a double slash (`./backend//service.py`).
if [[ -n "${CONFIG[CLAUDE_SCAFFOLDING_BACKEND_EXAMPLE_PATH]:-}" ]]; then
  CONFIG[CLAUDE_SCAFFOLDING_BACKEND_EXAMPLE_PATH]="${CONFIG[CLAUDE_SCAFFOLDING_BACKEND_EXAMPLE_PATH]%/}"
fi

# Export CONFIG entries so the python substitution script can read them
for k in "${!CONFIG[@]}"; do
  export "$k=${CONFIG[$k]}"
done

# Step 1: copy entire tree from repo to target (only when target differs from repo root)
if [[ "$CLAUDE_SCAFFOLDING_ROOT" != "$TARGET" ]]; then
  for item in "${COPY_ITEMS[@]}"; do
    src="$CLAUDE_SCAFFOLDING_ROOT/$item"
    dst="$TARGET/$item"
    [[ ! -e "$src" ]] && continue
    if $DRY_RUN; then
      echo "[dry-run] would copy $src -> $dst"
    else
      if [[ -d "$src" ]]; then
        mkdir -p "$dst"
        cp -r "$src/." "$dst/" || { echo "[error] copy failed: $src" >&2; exit 3; }
      else
        mkdir -p "$(dirname "$dst")"
        cp "$src" "$dst" || { echo "[error] copy failed: $src" >&2; exit 3; }
      fi
    fi
  done
  # Preserve executable bit on hook scripts
  if ! $DRY_RUN; then
    find "$TARGET/hooks" -type f -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
  fi
fi

# Step 2: render templates from templates/*.tmpl (source of truth) into target.
#
# Phase B model (Strategy C): source files in `skills/`, `agents/`, `commands/`,
# `settings.json`, `CLAUDE.md` are pre-rendered with sensible defaults (pytest,
# npm test, (project), ./backend, ./schemas, empty sonar key) so that the
# plugin install flow (`/plugin install claude-scaffolding@komluk-scaffolding`) is
# zero-config. For the Phase A install.sh flow we still want full
# parametrization, so the canonical placeholder form is kept in
# `templates/<rel>.tmpl` and rendered over the pre-rendered copies in --target.
render_file() {
  local rel="$1"
  local src="$CLAUDE_SCAFFOLDING_ROOT/templates/$rel.tmpl"
  local dst="$TARGET/$rel"
  if [[ ! -f "$src" ]]; then
    echo "[warn] template source missing: templates/$rel.tmpl" >&2
    return 0
  fi

  local rendered
  rendered="$(python3 - "$src" <<'PYEOF'
import os, sys
src = sys.argv[1]
with open(src, 'r', encoding='utf-8') as f:
    content = f.read()
for key, value in os.environ.items():
    if key.startswith('CLAUDE_SCAFFOLDING_'):
        content = content.replace(f"__{key}__", value)
sys.stdout.write(content)
PYEOF
)" || { echo "[error] render failed for $rel" >&2; exit 3; }

  if $DRY_RUN; then
    echo "[dry-run] would render templates/$rel.tmpl -> $dst ($(wc -l <<< "$rendered" | tr -d ' ') lines)"
  else
    mkdir -p "$(dirname "$dst")"
    printf '%s' "$rendered" > "$dst" || { echo "[error] write failed: $dst" >&2; exit 3; }
  fi
}

for f in "${TEMPLATES[@]}"; do
  render_file "$f"
done

# --- sanity check: no placeholder left in rendered template files ---
# Only the TEMPLATES list is scanned; documentation files (README, CHANGELOG,
# docs/, install.sh) legitimately mention `__CLAUDE_SCAFFOLDING_*__` names as
# reference and must not trigger this check.
if ! $DRY_RUN; then
  leftover=""
  for rel in "${TEMPLATES[@]}"; do
    dst="$TARGET/$rel"
    [[ ! -f "$dst" ]] && continue
    if grep -Hn "__CLAUDE_SCAFFOLDING_" "$dst" 2>/dev/null; then
      leftover="found"
    fi
  done
  if [[ -n "$leftover" ]]; then
    echo "[error] unreplaced placeholders found in rendered templates (see above)" >&2
    exit 2
  fi
  echo "[ok] claude-scaffolding installed to $TARGET"
else
  echo "[ok] dry-run complete, no files modified"
fi
