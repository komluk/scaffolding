#!/usr/bin/env bash
# uninstall.sh -- remove claude-scaffolding-rendered files from target directory
# Does NOT touch agent-memory/, projects/, sessions/ or ~/.claude-scaffolding.env.
set -euo pipefail

TARGET="${1:-$HOME/.claude}"

echo "[warn] This will remove claude-scaffolding-rendered files from $TARGET"
echo "[warn] Backups: agent-memory/, projects/, sessions/ are NOT touched"
if [[ -t 0 ]]; then
  read -r -p "Continue? (yes/no) " ans
else
  ans="no"
fi
[[ "$ans" == "yes" ]] || { echo "[info] aborted"; exit 0; }

REMOVE=(
  agents commands hooks output-styles templates validators workflows skills
  settings.json CLAUDE.md
)
for item in "${REMOVE[@]}"; do
  if [[ -e "$TARGET/$item" ]]; then
    rm -rf "$TARGET/$item" && echo "[ok] removed $item"
  fi
done
echo "[ok] uninstall done. ~/.claude-scaffolding.env preserved -- remove manually if desired."
