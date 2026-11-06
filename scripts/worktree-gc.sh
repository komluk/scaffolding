#!/usr/bin/env bash
# worktree-gc.sh -- remove git worktrees whose work already landed in the default branch.
#
# Dry run by default: prints REMOVE/KEEP, the reason and the path for every worktree.
# Nothing is deleted without --apply. Remote branches are never touched.
# When unsure, a worktree is KEPT.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: worktree-gc.sh [--apply] [--all-repos <dir>]

  (no flags)          dry run for every worktree of the current repo
  --apply             remove REMOVE worktrees, delete their local branches, git worktree prune
  --all-repos <dir>   scan each git repo directly under <dir> instead of the current repo

A worktree is REMOVE only if it has no uncommitted tracked changes AND its work is in
origin/<default>: no commits ahead, OR every non-merge commit is patch-equivalent
(git cherry shows no '+'), OR its remote ref is gone and each commit subject (trailing
" (#N)" stripped) is in origin/<default> history (squash merge).
The main checkout is never touched.
EOF
}

APPLY=0
ALL_DIR=""
while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1; shift ;;
        --all-repos)
            [ $# -ge 2 ] || { usage >&2; exit 2; }
            ALL_DIR="$2"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done

export GIT_TERMINAL_PROMPT=0
TMP="$(mktemp -d "${TMPDIR:-/tmp}/worktree-gc.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
CWD="$(pwd -P)"
SUBJECTS="$TMP/subjects"
ACTION=""
REASON=""
FAILED=0

# Fill $SUBJECTS with origin/<default> commit subjects, trailing " (#N)" stripped.
load_subjects() {
    [ -s "$SUBJECTS" ] && return 0
    git -C "$1" log --format=%s "$2" | sed -E 's/ \(#[0-9]+\)$//' >"$SUBJECTS"
}

# Count untracked (non-ignored) files and append a warning to REASON.
note_untracked() {
    local n
    n="$(git -C "$1" status --porcelain 2>/dev/null | grep -c '^??' || true)"
    if [ "${n:-0}" -gt 0 ]; then
        REASON="$REASON; $n untracked path(s) will be deleted"
    fi
    return 0
}

# classify <repo> <default> <path> <head> <branch> <flags> <is_main> -> sets ACTION, REASON
classify() {
    local repo="$1" def="$2" path="$3" head="$4" branch="$5" flags="$6" is_main="$7"
    local base="origin/$def" p out ahead commits c subj
    ACTION=KEEP
    if [ "$is_main" = 1 ]; then REASON="main checkout"; return 0; fi
    case "$flags" in *locked*) REASON="locked"; return 0 ;; esac
    if [ ! -d "$path" ]; then REASON="directory missing (git worktree prune)"; return 0; fi
    p="$(cd "$path" && pwd -P)" || { REASON="cannot resolve path"; return 0; }
    case "$CWD/" in "$p"/*) REASON="current directory is inside it"; return 0 ;; esac
    if [ -n "$branch" ] && [ "$branch" = "$def" ]; then REASON="on default branch $def"; return 0; fi
    if ! git -C "$repo" rev-parse --verify -q "refs/remotes/$base^{commit}" >/dev/null; then
        REASON="$base not found"; return 0
    fi
    if [ -z "$head" ]; then REASON="no HEAD commit"; return 0; fi
    if ! out="$(git -C "$path" status --porcelain --untracked-files=no 2>/dev/null)"; then
        REASON="git status failed"; return 0
    fi
    if [ -n "$out" ]; then REASON="uncommitted tracked changes"; return 0; fi

    ahead="$(git -C "$repo" rev-list --count "$base..$head" 2>/dev/null)" \
        || { REASON="rev-list failed"; return 0; }
    if [ "$ahead" = 0 ]; then
        ACTION=REMOVE; REASON="no commits ahead of $base"; note_untracked "$path"; return 0
    fi

    out="$(git -C "$repo" cherry "$base" "$head" 2>/dev/null)" || { REASON="git cherry failed"; return 0; }
    if ! grep -q '^+' <<<"$out"; then
        ACTION=REMOVE; REASON="all commits patch-equivalent in $base"; note_untracked "$path"; return 0
    fi

    if [ -n "$branch" ] \
        && [ "$(git -C "$repo" for-each-ref --format='%(upstream:track)' "refs/heads/$branch")" = "[gone]" ]; then
        load_subjects "$repo" "$base" || { REASON="git log failed"; return 0; }
        commits="$(git -C "$repo" rev-list --no-merges "$base..$head")" || { REASON="rev-list failed"; return 0; }
        while IFS= read -r c; do
            [ -n "$c" ] || continue
            subj="$(git -C "$repo" log -1 --format=%s "$c" | sed -E 's/ \(#[0-9]+\)$//')"
            if [ -z "$subj" ] || ! grep -Fxq -- "$subj" "$SUBJECTS"; then
                REASON="remote ref gone, but subject not in $base: ${c:0:9}"; return 0
            fi
        done <<<"$commits"
        ACTION=REMOVE; REASON="squash-merged (remote ref gone, subjects in $base)"
        note_untracked "$path"; return 0
    fi

    REASON="$ahead commit(s) not in $base"
    return 0
}

# remove_one <repo> <path> <branch>: tracked state was verified clean by classify.
remove_one() {
    local repo="$1" path="$2" branch="$3" s
    if ! git -C "$repo" worktree remove -- "$path" 2>"$TMP/err"; then
        # git refuses on untracked files (e.g. node_modules); retry --force only if tracked state is still clean
        if grep -q -- '--force' "$TMP/err" && s="$(git -C "$path" status --porcelain --untracked-files=no 2>/dev/null)" \
            && [ -z "$s" ] && git -C "$repo" worktree remove --force -- "$path" 2>"$TMP/err"; then
            :
        else
            echo "        FAILED worktree remove: $(head -n1 "$TMP/err")"; FAILED=1; return 0
        fi
    fi
    echo "        removed worktree"
    if [ -n "$branch" ]; then
        if git -C "$repo" branch -D -- "$branch" >/dev/null 2>"$TMP/err"; then
            echo "        deleted local branch $branch"
        else
            echo "        FAILED branch -D $branch: $(head -n1 "$TMP/err")"; FAILED=1
        fi
    fi
    return 0
}

gc_repo() {
    local repo="$1" ref def porcelain line i=-1 n nrm=0 nkeep=0
    local -a P=() H=() B=() F=()
    if ! git -C "$repo" fetch --prune >/dev/null 2>"$TMP/err"; then
        echo "warning: git fetch --prune failed in $repo: $(head -n1 "$TMP/err")" >&2
    fi
    ref="$(git -C "$repo" symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null)" || ref=""
    def="${ref#refs/remotes/origin/}"
    if [ -z "$ref" ] || [ "$def" = "$ref" ] || [ -z "$def" ]; then def=main; fi
    : >"$SUBJECTS"

    porcelain="$(git -C "$repo" worktree list --porcelain)" || { echo "error: cannot list worktrees in $repo" >&2; FAILED=1; return 0; }
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            "worktree "*) i=$((i + 1)); P[i]="${line#worktree }"; H[i]=""; B[i]=""; F[i]="" ;;
            "HEAD "*) H[i]="${line#HEAD }" ;;
            "branch refs/heads/"*) B[i]="${line#branch refs/heads/}" ;;
            detached) F[i]="${F[i]} detached" ;;
            bare) F[i]="${F[i]} bare" ;;
            locked*) F[i]="${F[i]} locked" ;;
        esac
    done <<<"$porcelain"

    echo "== $repo (default branch: $def)"
    printf '%-6s  %-52s  %s\n' ACTION REASON PATH
    for ((n = 0; n <= i; n++)); do
        local is_main=0
        if [ "$n" -eq 0 ]; then is_main=1; fi
        classify "$repo" "$def" "${P[n]}" "${H[n]}" "${B[n]}" "${F[n]}" "$is_main"
        printf '%-6s  %-52s  %s\n' "$ACTION" "$REASON" "${P[n]}"
        if [ "$ACTION" = REMOVE ]; then
            nrm=$((nrm + 1))
            if [ "$APPLY" = 1 ]; then remove_one "$repo" "${P[n]}" "${B[n]}"; fi
        else
            nkeep=$((nkeep + 1))
        fi
    done
    if [ "$APPLY" = 1 ]; then git -C "$repo" worktree prune || FAILED=1; fi
    if [ "$APPLY" = 1 ]; then
        echo "-- removed=$nrm kept=$nkeep"
    else
        echo "-- dry run: would remove=$nrm keep=$nkeep (use --apply)"
    fi
    return 0
}

if [ -n "$ALL_DIR" ]; then
    [ -d "$ALL_DIR" ] || { echo "error: not a directory: $ALL_DIR" >&2; exit 2; }
    for d in "$ALL_DIR"/*/; do
        d="${d%/}"
        [ -d "$d/.git" ] || continue
        gc_repo "$d"
    done
else
    top="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "error: not inside a git repository" >&2; exit 2; }
    gc_repo "$top"
fi

[ "$FAILED" -eq 0 ]
