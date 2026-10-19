#!/usr/bin/env bash
# count-conversations.sh — helper (not a registered hook) for the conversations
# migration: prints "<project> <n_conv> <n_files>" per project, sorted by project.
#
# Usage: count-conversations.sh <root>...
# Each <root> is either
#   - a repo / project dir that has .scaffolding/conversations (one line), or
#   - a dir whose immediate children are such repos (e.g. ~/repos), or
#   - a share root: <root>/projects/<name>/conversations (one line per project).
# Symlinks are followed once (the conversations dir itself). Counts direct
# subdirs as conversations and regular files below them (pre-nfs backups and
# _legacy are excluded). Output is stable and sorted. Always exits 0.
set +e
export LC_ALL=C

count() {
    local name="$1" dir="$2" n f
    [ -d "$dir/" ] || return 0
    n="$(find "$dir/" -mindepth 1 -maxdepth 1 -type d ! -name '_legacy' 2>/dev/null | wc -l | tr -d ' ')"
    f="$(find "$dir/" -mindepth 2 -type f ! -path "$dir/_legacy/*" 2>/dev/null | wc -l | tr -d ' ')"
    printf '%s %s %s\n' "$name" "$n" "$f"
}

emit() {
    local root="${1%/}" p
    [ -d "$root" ] || return 0
    if [ -d "$root/.scaffolding/conversations/" ]; then
        count "$(basename "$root")" "$root/.scaffolding/conversations"
    fi
    if [ -d "$root/projects" ]; then
        for p in "$root"/projects/*/; do
            p="${p%/}"
            count "$(basename "$p")" "$p/conversations"
        done
    fi
    for p in "$root"/*/; do
        p="${p%/}"
        [ "$(basename "$p")" = projects ] && continue
        [ -d "$p/.scaffolding/conversations/" ] && count "$(basename "$p")" "$p/.scaffolding/conversations"
    done
}

for r in "$@"; do emit "$r"; done | sort -u
exit 0
