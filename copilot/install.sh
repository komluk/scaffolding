#!/usr/bin/env bash
# Install the Copilot CLI sync tooling into ~/.copilot, then run the sync.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.copilot"
mkdir -p "$DEST/hooks"
cp "$SRC"/scaffolding-* "$DEST/"
cp "$SRC/hooks/pre-commit-validation-copilot.sh.tmpl" "$DEST/hooks/"
chmod +x "$DEST"/scaffolding-*
"$DEST/scaffolding-sync.sh"
