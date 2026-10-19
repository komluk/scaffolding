#!/usr/bin/env bash
# nfs-sync.sh — link <repo>/.scaffolding/conversations to the shared NFS share.
#
# One conversation layout everywhere:
#   <repo>/.scaffolding/conversations -> <share>/projects/<repo-name>/conversations
# There is exactly one live copy (on the share); nothing is synced or mirrored.
#
# Usage:
#   nfs-sync.sh pull                       SessionStart: link CLAUDE_PROJECT_DIR and
#                                          each immediate child repo that already has
#                                          .scaffolding/ (opt-in, see below)
#   nfs-sync.sh link [--dry-run] [dir...]  explicit setup/migration entry point
#                                          (no opt-in needed; default dir = project dir)
#   nfs-sync.sh push                       no-op (kept so old Stop wiring is harmless)
#
# <share> is per machine: SCAFFOLDING_NFS_ROOT, else the first of
# /mnt/scaffolding-data, /mnt/scaffolding that has a projects/ dir.
# `pull` only acts when SCAFFOLDING_NFS_ROOT is set or the repo has a
# .scaffolding/.nfs-sync sentinel (an absolute path on line 1 names the share).
#
# Per local .scaffolding/conversations:
#   symlink to the share target ........ no-op
#   absent or empty dir ................. mkdir -p target, ln -s
#   populated dir ....................... cp -n into target, verify every file,
#                                         mv local to conversations.pre-nfs-<ts>, ln -s
#   foreign symlink / not a dir / any error: left untouched, warning on stderr
# Files that exist on both sides with different content are never overwritten:
# the share copy wins, the local copy stays in the .pre-nfs-<ts> backup.
#
# Tunables: SCAFFOLDING_NFS_TIMEOUT (per NFS op, default 20s),
#           SCAFFOLDING_NFS_COPY_TIMEOUT (copy + verify, default 120s),
#           SCAFFOLDING_NFS_PROBE_TIMEOUT (reachability probe, default 5s).
# ALWAYS exits 0 — an unreachable share must never block or fail a session.
set +e
umask 002

MODE="${1:-}"
case "$MODE" in
    pull|link) ;;
    *) exit 0 ;;
esac
shift

NFS_TIMEOUT="${SCAFFOLDING_NFS_TIMEOUT:-20}"
COPY_TIMEOUT="${SCAFFOLDING_NFS_COPY_TIMEOUT:-120}"
PROBE_TIMEOUT="${SCAFFOLDING_NFS_PROBE_TIMEOUT:-5}"
ROOT=""

warn() { echo "[scaffolding] nfs-sync: $*" >&2; }
# SessionStart stdout becomes model context, so progress goes to stderr there.
out() { if [ "$MODE" = link ]; then echo "$*"; else echo "$*" >&2; fi; }
nfs() { timeout -k 2 "$NFS_TIMEOUT" "$@"; }

# resolve_root <dir>: print the share root. Env > sentinel path > auto-detect.
resolve_root() {
    local r="${SCAFFOLDING_NFS_ROOT:-}" first c
    if [ -z "$r" ] && [ -f "$1/.scaffolding/.nfs-sync" ]; then
        first="$(head -n1 "$1/.scaffolding/.nfs-sync" 2>/dev/null)"
        case "$first" in /*) r="$first" ;; esac
    fi
    if [ -n "$r" ]; then
        printf '%s\n' "${r%/}"
        return 0
    fi
    for c in /mnt/scaffolding-data /mnt/scaffolding; do
        if timeout -k 2 "$PROBE_TIMEOUT" test -d "$c/projects"; then
            printf '%s\n' "$c"
            return 0
        fi
    done
    return 1
}

share_reachable() {
    timeout -k 2 "$PROBE_TIMEOUT" test -d "$1/projects"
}

# compare_trees <src> <dst>: sets CMP_RC, CMP_MISSING (entries only in src),
# CMP_CONFLICTS (lines for same-path differences).
compare_trees() {
    local res rc
    res="$(timeout -k 2 "$COPY_TIMEOUT" diff -rq --no-dereference "$1" "$2" 2>/dev/null)"
    rc=$?
    CMP_RC=$rc
    CMP_MISSING="$(printf '%s\n' "$res" | awk -v p="Only in $1" 'index($0,p)==1{n++} END{print n+0}')"
    CMP_CONFLICTS="$(printf '%s\n' "$res" | awk 'NF && index($0,"Only in ")!=1')"
}

# _link <dir> <dry 0|1>
_link() {
    local dir="$1" dry="$2"
    local sc="$dir/.scaffolding" lc name target raw ts bak n

    [ -d "$sc" ] || return 0
    case "$dir" in
        */.scaffolding/worktrees/*) return 0 ;;   # worktree hooks link these
    esac
    # A linked worktree/submodule has a .git file; its basename is not a project.
    [ -f "$dir/.git" ] && return 0

    name="$(basename "$dir")"
    target="$ROOT/projects/$name/conversations"
    lc="$sc/conversations"

    if [ -L "$lc" ]; then
        raw="$(readlink "$lc")"
        if [ "$raw" = "$target" ] || \
           [ "$(nfs readlink -m "$lc")" = "$(nfs readlink -m "$target")" ]; then
            # Correct link; heal a missing target dir so writes don't fail.
            if [ "$dry" != 1 ] && [ ! -d "$lc" ]; then
                nfs mkdir -p "$target" 2>/dev/null || warn "cannot create $target"
            fi
            return 0
        fi
        warn "$lc points to $raw, not $target — left untouched"
        return 0
    fi

    if [ -e "$lc" ] && [ ! -d "$lc" ]; then
        warn "$lc is not a directory — left untouched"
        return 0
    fi

    # Absent or empty dir -> plain link.
    if [ ! -e "$lc" ] || [ -z "$(ls -A "$lc" 2>/dev/null)" ]; then
        if [ "$dry" = 1 ]; then
            out "[dry-run] $dir: would link $lc -> $target"
            return 0
        fi
        nfs mkdir -p "$target" || { warn "cannot create $target — $lc left untouched"; return 0; }
        [ -d "$lc" ] && { rmdir "$lc" 2>/dev/null || { warn "cannot replace empty $lc"; return 0; }; }
        if ! ln -s "$target" "$lc"; then
            warn "ln -s failed for $lc — restoring empty dir"
            mkdir -p "$lc"
            return 0
        fi
        out "[scaffolding] nfs-sync: linked $lc -> $target"
        return 0
    fi

    # Populated real dir -> migrate.
    n="$(find "$lc/" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$dry" = 1 ]; then
        if [ -d "$target" ]; then
            compare_trees "$lc" "$target"
            out "[dry-run] $dir: would migrate $n entries to $target (missing on share: $CMP_MISSING, conflicts: $(printf '%s' "$CMP_CONFLICTS" | grep -c .)), back up local as conversations.pre-nfs-<ts>, then link"
        else
            out "[dry-run] $dir: would migrate $n entries to $target, back up local as conversations.pre-nfs-<ts>, then link"
        fi
        return 0
    fi

    nfs mkdir -p "$target" || { warn "cannot create $target — $lc left untouched"; return 0; }
    # Exit status ignored on purpose: newer coreutils report skipped (-n) files
    # as failure. The verification below is the real check.
    timeout -k 2 "$COPY_TIMEOUT" cp -r -n -P --preserve=timestamps "$lc/." "$target/" 2>/dev/null
    compare_trees "$lc" "$target"
    if [ "$CMP_RC" -ge 2 ] || [ "$CMP_MISSING" -gt 0 ]; then
        warn "copy verification failed for $lc (diff rc=$CMP_RC, missing=$CMP_MISSING) — local dir untouched, no link created"
        return 0
    fi

    ts="$(date +%Y%m%d-%H%M%S)"
    bak="$sc/conversations.pre-nfs-$ts"
    [ -e "$bak" ] && bak="$bak-$$"
    mv "$lc" "$bak" || { warn "cannot back up $lc — left untouched"; return 0; }
    if ! ln -s "$target" "$lc"; then
        mv "$bak" "$lc"
        warn "ln -s failed for $lc — local dir restored"
        return 0
    fi
    out "[scaffolding] nfs-sync: migrated $n entries, linked $lc -> $target (backup: $bak)"
    if [ -n "$CMP_CONFLICTS" ]; then
        warn "conflicts (share copy kept, local copy preserved in $bak):"
        printf '%s\n' "$CMP_CONFLICTS" >&2
    fi
    return 0
}

link_conversations() {
    local dir="$1" dry="$2"
    [ -d "$dir/.scaffolding" ] || return 0
    if [ "$dry" != 1 ] && command -v flock >/dev/null 2>&1; then
        (
            # Group the redirect: a bare `exec ... 2>/dev/null` would silence
            # stderr for the whole subshell and swallow every warning.
            { exec 9>"$dir/.scaffolding/.nfs-sync.lock"; } 2>/dev/null || exit 0
            flock -n 9 || exit 0
            _link "$dir" "$dry"
        )
    else
        _link "$dir" "$dry"
    fi
}

abs_dir() { (cd "$1" 2>/dev/null && pwd); }

if [ "$MODE" = pull ]; then
    DIR="$(abs_dir "${CLAUDE_PROJECT_DIR:-$PWD}")"
    [ -n "$DIR" ] || exit 0
    # Opt-in gate (before ANY NFS access).
    if [ -z "${SCAFFOLDING_NFS_ROOT:-}" ] && [ ! -f "$DIR/.scaffolding/.nfs-sync" ]; then
        exit 0
    fi
    ROOT="$(resolve_root "$DIR")"
    if [ -z "$ROOT" ] || ! share_reachable "$ROOT"; then
        warn "share ${ROOT:-<none found>} unreachable, skipping (local data intact)"
        exit 0
    fi
    link_conversations "$DIR" 0
    for child in "$DIR"/*/; do
        child="${child%/}"
        [ -e "$child/.git" ] && [ -d "$child/.scaffolding" ] || continue
        link_conversations "$child" 0
    done
    exit 0
fi

# link [--dry-run] [dir...]
DRY=0
DIRS=()
for a in "$@"; do
    case "$a" in
        --dry-run) DRY=1 ;;
        *) DIRS+=("$a") ;;
    esac
done
[ "${#DIRS[@]}" -gt 0 ] || DIRS=("${CLAUDE_PROJECT_DIR:-$PWD}")

for d in "${DIRS[@]}"; do
    d="$(abs_dir "$d")"
    [ -n "$d" ] && [ -d "$d/.scaffolding" ] || continue
    ROOT="$(resolve_root "$d")"
    if [ -z "$ROOT" ] || ! share_reachable "$ROOT"; then
        warn "share ${ROOT:-<none found>} unreachable, skipping $d (local data intact)"
        continue
    fi
    link_conversations "$d" "$DRY"
done
exit 0
