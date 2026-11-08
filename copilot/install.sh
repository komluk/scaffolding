#!/usr/bin/env bash
# Install the Copilot CLI sync tooling into ~/.copilot, then run the sync.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.copilot"
mkdir -p "$DEST/hooks"
# retire the python tooling of earlier versions (replaced by the .mjs files below)
rm -f "$DEST"/scaffolding-hook-merge.py "$DEST"/scaffolding-skills-merge.py "$DEST"/scaffolding-transform.py
cp "$SRC"/scaffolding-* "$DEST/"
cp "$SRC/hooks/pre-commit-validation-copilot.sh.tmpl" "$DEST/hooks/"
chmod +x "$DEST"/scaffolding-*
"$DEST/scaffolding-sync.sh"
