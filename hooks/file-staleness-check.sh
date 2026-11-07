#!/usr/bin/env bash
# File staleness guard: blocks Edit/Write on files modified externally since
# the task last accessed them. Uses SCAFFOLDING_TASK_ID env var to scope
# mtime tracking per task session.

set -euo pipefail

# Skip if not running inside a managed task
if [ -z "${SCAFFOLDING_TASK_ID:-}" ]; then
    exit 0
fi

# Node is the JSON/mtime helper (hooks/lib/staleness.mjs; stdin = hook JSON). It reads the file_path,
# stats the file and compares with /tmp/scaffolding-mtime-<task>.json. Without node: fail open.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, file-staleness-check not enforced" >&2; exit 0; }
exec node "$LIB/staleness.mjs" check
