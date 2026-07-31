#!/usr/bin/env bash
# nfs-sync.sh — opt-in mirror of .scaffolding/ to a TrueNAS NFS share.
#
# Opt-in via SCAFFOLDING_NFS_ROOT env var or the .scaffolding/.nfs-sync
# sentinel file. Default off for every repo/machine that has not opted in.
#
# Local .scaffolding/ is ALWAYS authoritative; NFS is a non-authoritative
# replica. This script never removes, truncates or overwrites-with-older any
# local file, and it ALWAYS exits 0 — a slow/unreachable/read-only share must
# never block or fail a session.
#
# The target directory name embeds the project id (basename-derived slug +
# project-id hash), so moving a repo whose project id is path-derived (no git
# remote) changes the target directory on the share.
set +e

MODE="${1:-}"
case "$MODE" in
    pull|push) ;;
    *) exit 0 ;;
esac

DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
SC="$DIR/.scaffolding"
[ -d "$SC" ] || exit 0

# --- Opt-in gate (before ANY NFS access) ---
NFS_ROOT="${SCAFFOLDING_NFS_ROOT:-}"
if [ -z "$NFS_ROOT" ]; then
    if [ -f "$SC/.nfs-sync" ]; then
        first_line="$(head -n1 "$SC/.nfs-sync" 2>/dev/null)"
        if [ -n "$first_line" ] && [ "${first_line#/}" != "$first_line" ]; then
            NFS_ROOT="$first_line"
        else
            NFS_ROOT="/mnt/scaffolding"
        fi
    else
        exit 0
    fi
fi

PROBE_TIMEOUT="${SCAFFOLDING_NFS_PROBE_TIMEOUT:-5}"
SYNC_TIMEOUT="${SCAFFOLDING_NFS_TIMEOUT:-20}"

# --- Compute target dir ---
pid="$(cat "$SC/project-id" 2>/dev/null)"
if [ -z "$pid" ]; then
    echo "[scaffolding] nfs-sync: no project-id, skipping (local data intact)" >&2
    exit 0
fi
hash="${pid#scaffold:}"

slug="$(basename "$DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g' | cut -c1-40)"
TARGET="$NFS_ROOT/projects/${slug}-${hash}"

# --- Reachability probe ---
if ! timeout "$PROBE_TIMEOUT" test -d "$NFS_ROOT/projects"; then
    echo "[scaffolding] nfs-sync: $NFS_ROOT unreachable, skipping (local data intact)" >&2
    exit 0
fi

# --- Lock (skip rather than queue) ---
exec 9>"$SC/.nfs-sync.lock"
flock -n 9 || exit 0

EXCLUDES=(
    --exclude 'worktrees/'
    --exclude '.nfs-sync'
    --exclude '.nfs-sync.lock'
    --exclude '.ingest-dirty'
    --exclude '.ingest-queue'
    --exclude '.ingest-seen'
    --exclude '.noingest'
    --exclude '*.lock'
    --exclude '.git/'
)

RSYNC_FLAGS=(-rlt --no-perms --no-owner --no-group --omit-dir-times --update)

if [ "$MODE" = "push" ]; then
    timeout "$SYNC_TIMEOUT" mkdir -p "$TARGET"
    rc=$?
    if [ "$rc" -ne 0 ]; then
        echo "[scaffolding] nfs-sync push failed (rc=$rc) — local data intact" >&2
        exit 0
    fi

    timeout "$SYNC_TIMEOUT" rsync "${RSYNC_FLAGS[@]}" "${EXCLUDES[@]}" "$SC/" "$TARGET/"
    rc=$?
    if [ "$rc" -ne 0 ]; then
        echo "[scaffolding] nfs-sync push failed (rc=$rc) — local data intact" >&2
        exit 0
    fi

    hostname_s="$(hostname -s 2>/dev/null)"
    last_push="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
    plugin_version="$(python3 -c "import json;print(json.load(open('$plugin_root/.claude-plugin/plugin.json'))['version'])" 2>/dev/null)"
    printf '{\n  "project_id": "%s",\n  "project_path": "%s",\n  "hostname": "%s",\n  "last_push": "%s",\n  "plugin_version": "%s"\n}\n' \
        "$pid" "$DIR" "$hostname_s" "$last_push" "$plugin_version" \
        > "$TARGET/project.json.tmp" 2>/dev/null \
        && mv "$TARGET/project.json.tmp" "$TARGET/project.json" 2>/dev/null
else
    [ -d "$TARGET" ] || exit 0
    timeout "$SYNC_TIMEOUT" rsync "${RSYNC_FLAGS[@]}" "${EXCLUDES[@]}" --exclude 'project.json' "$TARGET/" "$SC/"
    rc=$?
    if [ "$rc" -ne 0 ]; then
        echo "[scaffolding] nfs-sync pull failed (rc=$rc) — local data intact" >&2
        exit 0
    fi
fi

exit 0
