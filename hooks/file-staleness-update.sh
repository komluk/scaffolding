#!/usr/bin/env bash
# PostToolUse counterpart to file-staleness-check.sh: updates stored mtime
# after a successful Edit/Write so the next PreToolUse check uses the new value.

set -euo pipefail

# Skip if not running inside a managed task
if [ -z "${SCAFFOLDING_TASK_ID:-}" ]; then
    exit 0
fi

# Node is the JSON/mtime helper (hooks/lib/staleness.mjs; stdin = hook JSON). It reads the file_path,
# stats the file and records into /tmp/scaffolding-mtime-<task>.json. Without node: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, file-staleness-update not enforced" >&2; exit 0; }
exec node "$LIB/staleness.mjs" update
