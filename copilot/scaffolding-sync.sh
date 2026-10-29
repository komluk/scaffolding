#!/usr/bin/env bash
set -euo pipefail

# scaffolding-sync.sh — propagate the 6 approved scaffolding agents (and,
# optionally, the scaffolding skills) from the komluk-scaffolding Claude Code
# plugin cache into GitHub Copilot CLI's user-level config.
#
# This script only READS ~/.claude/plugins/cache/** and ~/.claude/**. All
# writes land under ~/.copilot/ (and, for the hook wrapper registration, under
# the target repos' own .claude/settings.json — see design D2/V15).
#
# Usage:
#   ~/.copilot/scaffolding-sync.sh              run the sync
#   ~/.copilot/scaffolding-sync.sh --dry-run     print planned actions, write nothing
#   ~/.copilot/scaffolding-sync.sh --uninstall   remove everything this script owns

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./scaffolding-plugin-root.sh
source "$SCRIPT_DIR/scaffolding-plugin-root.sh"

AGENTS_DIR="$HOME/.copilot/agents"
MARKER="<!-- generated-by: scaffolding-copilot-sync"
AGENTS=(developer debugger reviewer tech-writer devops gitops)

DRY_RUN=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

# Repos whose .claude/settings.json gets the PreToolUse hook merged in
# (design D2/V15 — no user-level hook path fires under copilot 1.0.77).
HOOK_REPOS=(
  "$HOME/repos/.claude/settings.json"
  "$HOME/repos/homelab/.claude/settings.json"
  "$HOME/repos/aiproxy/.claude/settings.json"
)
HOOK_WRAPPER="$HOME/.copilot/hooks/pre-commit-validation-copilot.sh"
HOOK_MARKER="generated-by: scaffolding-copilot-sync"

# --- uninstall path -------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
  echo "Uninstalling scaffolding-copilot-sync artifacts..."
  removed=0
  if [ -d "$AGENTS_DIR" ]; then
    for f in "$AGENTS_DIR"/*.md; do
      [ -f "$f" ] || continue
      if grep -qF "$MARKER" "$f" 2>/dev/null; then
        rm -f "$f"
        removed=$((removed + 1))
      fi
    done
  fi
  echo "  removed $removed marker-scoped agent file(s)"

  if [ -f "$HOOK_WRAPPER" ]; then
    rm -f "$HOOK_WRAPPER"
    echo "  removed hook wrapper: $HOOK_WRAPPER"
  fi

  for settings in "${HOOK_REPOS[@]}"; do
    [ -f "$settings" ] || continue
    python3 "$SCRIPT_DIR/scaffolding-hook-merge.py" --remove "$settings" "$HOOK_WRAPPER" 2>/dev/null \
      && echo "  removed PreToolUse entry from: $settings"
  done

  if [ -f "$HOME/.copilot/settings.json" ]; then
    python3 "$SCRIPT_DIR/scaffolding-skills-merge.py" --remove "$HOME/.copilot/settings.json" 2>/dev/null \
      && echo "  removed skillDirectories entry from ~/.copilot/settings.json (if present)"
  fi

  echo "Uninstall complete."
  exit 0
fi

# --- resolve SRC (install / dry-run path) ---------------------------------
if ! SRC=$(resolve_plugin_root); then
  echo "ERROR: scaffolding-sync: could not resolve the scaffolding plugin root. Tried:" >&2
  echo "  - \$SCAFFOLDING_PLUGIN_ROOT env override" >&2
  echo "  - ~/.claude/plugins/installed_plugins.json manifest" >&2
  echo "  - highest version dir under ~/.claude/plugins/cache/komluk-scaffolding/scaffolding" >&2
  exit 1
fi
VERSION="$(basename "$SRC")"
echo "Resolved scaffolding plugin root: $SRC (version $VERSION)"

# --- agent generation ------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would ensure directory: $AGENTS_DIR"
else
  mkdir -p "$AGENTS_DIR"
fi

written=0
for agent in "${AGENTS[@]}"; do
  src_file="$SRC/agents/$agent.md"
  dest_file="$AGENTS_DIR/scaffolding-$agent.md"
  if [ ! -f "$src_file" ]; then
    echo "ERROR: scaffolding-sync: expected source agent missing: $src_file" >&2
    exit 1
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] would write: $dest_file (name: scaffolding:$agent, from $src_file)"
  else
    python3 "$SCRIPT_DIR/scaffolding-transform.py" "$agent" "$src_file" "$dest_file"
    written=$((written + 1))
  fi
done

# --- marker-scoped prune (only files carrying the marker, not in AGENTS) --
pruned=0
if [ -d "$AGENTS_DIR" ]; then
  for f in "$AGENTS_DIR"/*.md; do
    [ -f "$f" ] || continue
    grep -qF "$MARKER" "$f" 2>/dev/null || continue
    base="$(basename "$f" .md)"
    keep=0
    for agent in "${AGENTS[@]}"; do
      if [ "$base" = "scaffolding-$agent" ]; then
        keep=1
        break
      fi
    done
    if [ "$keep" -eq 0 ]; then
      if [ "$DRY_RUN" -eq 1 ]; then
        echo "[dry-run] would prune stale generated agent: $f"
      else
        rm -f "$f"
        pruned=$((pruned + 1))
      fi
    fi
  done
fi

# --- hook wrapper: render + merge registration -----------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would write hook wrapper: $HOOK_WRAPPER (validator root baked in: $SRC)"
  for settings in "${HOOK_REPOS[@]}"; do
    echo "[dry-run] would merge PreToolUse entry into: $settings"
  done
else
  mkdir -p "$(dirname "$HOOK_WRAPPER")"
  sed "s#__SCAFFOLDING_PLUGIN_ROOT_FASTPATH__#$SRC#" \
    "$SCRIPT_DIR/hooks/pre-commit-validation-copilot.sh.tmpl" > "$HOOK_WRAPPER.tmp"
  mv "$HOOK_WRAPPER.tmp" "$HOOK_WRAPPER"
  chmod +x "$HOOK_WRAPPER"

  for settings in "${HOOK_REPOS[@]}"; do
    mkdir -p "$(dirname "$settings")"
    if [ ! -f "$settings" ]; then
      echo '{}' > "$settings"
    fi
    python3 "$SCRIPT_DIR/scaffolding-hook-merge.py" "$settings" "$HOOK_WRAPPER"
  done
fi

# --- optional skills registration (design A5 / group 5) --------------------
SKILLS_OK=1
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would register skills dir: $SRC/skills (copilot skill add) and update ~/.copilot/settings.json"
else
  if python3 "$SCRIPT_DIR/scaffolding-skills-merge.py" "$HOME/.copilot/settings.json" "$SRC"; then
    if command -v copilot >/dev/null 2>&1; then
      copilot skill add "$SRC/skills" >/tmp/scaffolding-sync-skill-add.log 2>&1 || SKILLS_OK=0
    else
      SKILLS_OK=0
    fi
  else
    SKILLS_OK=0
  fi
  if [ "$SKILLS_OK" -ne 1 ]; then
    echo "WARNING: skills registration (group 5, optional) did not complete cleanly — see /tmp/scaffolding-sync-skill-add.log. Agents and hook are unaffected." >&2
  fi
fi

# --- summary ---------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] no files were written."
else
  echo "synced $written agents from $VERSION, pruned $pruned stale, hook wrapper installed, skills registration $([ "$SKILLS_OK" -eq 1 ] && echo ok || echo skipped)"
  echo "Reminder: BYOK base URL must include /v1 (export COPILOT_PROVIDER_BASE_URL=https://ai.komluk.com/v1)"
fi
