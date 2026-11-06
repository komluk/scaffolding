#!/usr/bin/env bash
# Tests for scripts/worktree-gc.sh (temp bare origin + clone; no network).
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

GC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../scripts" && pwd)/worktree-gc.sh"
T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

git init -q --bare -b main "$T/origin.git"
git clone -q "$T/origin.git" "$T/my repo" 2>/dev/null   # space in path on purpose
R="$(cd "$T/my repo" && pwd -P)"
g() { git -C "$R" "$@"; }
commit() { echo "$2" >>"$1/$2.txt"; git -C "$1" add -A; git -C "$1" commit -q -m "$3"; }
g checkout -q -b main 2>/dev/null || true
commit "$R" base "init"
g push -q -u origin main
g remote set-head origin main

wt() { g worktree add -q -b "$1" "$T/wt/$1" main; }   # wt <branch>; path = $T/wt/<branch>

# merged-ff: branch pushed, fast-forwarded into main
wt merged-ff; commit "$T/wt/merged-ff" ff "feat: ff"
git -C "$T/wt/merged-ff" push -q -u origin merged-ff
g merge -q --ff-only merged-ff; g push -q origin main

# squash: pushed, squash-merged with " (#7)", remote branch deleted
wt squashed; commit "$T/wt/squashed" sq "feat: squash me"
git -C "$T/wt/squashed" push -q -u origin squashed
g merge -q --squash squashed >/dev/null; g commit -q -m "feat: squash me (#7)"; g push -q origin main
git -C "$T/origin.git" branch -q -D squashed

# squash-gone-no-match: remote gone but its subject never landed in main
wt lost; commit "$T/wt/lost" lost "feat: never merged"
git -C "$T/wt/lost" push -q -u origin lost
git -C "$T/origin.git" branch -q -D lost

# unmerged: commit ahead, remote exists
wt unmerged; commit "$T/wt/unmerged" un "feat: wip"
git -C "$T/wt/unmerged" push -q -u origin unmerged

# dirty: on a merged branch, but a tracked file is modified
wt dirty; echo more >>"$T/wt/dirty/base.txt"

# untracked-only: clean tracked state, node_modules output -> REMOVE (needs --force)
wt buildout; mkdir "$T/wt/buildout/node_modules"; echo x >"$T/wt/buildout/node_modules/f"

# cherry-pick: same patch landed on main under a different commit
wt picked; commit "$T/wt/picked" pk "feat: picked"
g cherry-pick -x picked >/dev/null; g push -q origin main

g fetch -q --prune
cp -r "$T/origin.git" "$T/origin.before"

row() { grep -F -- "$T/wt/$1" "$T/out" | head -n1 || true; }
action() { row "$1" | awk '{print $1}'; }
exists() { [ -d "$T/wt/$1" ]; }
has_branch() { g rev-parse --verify -q "refs/heads/$1" >/dev/null; }

echo "# dry run"
( cd "$R" && bash "$GC" ) >"$T/out" 2>"$T/err"; rc=$?
check "exit 0" test "$rc" = 0
check "merged-ff -> REMOVE"            test "$(action merged-ff)" = REMOVE
check "squashed (remote gone) -> REMOVE" test "$(action squashed)" = REMOVE
check "buildout (untracked only) -> REMOVE" test "$(action buildout)" = REMOVE
check "picked (patch-equivalent) -> REMOVE" test "$(action picked)" = REMOVE
check "unmerged -> KEEP"               test "$(action unmerged)" = KEEP
check "lost (gone, subject missing) -> KEEP" test "$(action lost)" = KEEP
check "dirty -> KEEP"                  test "$(action dirty)" = KEEP
check "dirty reason mentions uncommitted" contains "$(row dirty)" "uncommitted"
check "main checkout -> KEEP"          test "$(grep -F "main checkout" "$T/out" | head -n1 | awk '{print $1}')" = KEEP
check "dry run removed nothing" bash -c "cd '$T/wt' && ls | wc -l | grep -qx 7"
check "dry run kept all branches" has_branch squashed

echo "# --apply"
( cd "$R" && bash "$GC" --apply ) >"$T/out" 2>"$T/err"; rc=$?
check "exit 0" test "$rc" = 0
for b in merged-ff squashed buildout picked; do
    check "$b worktree removed" test ! -e "$T/wt/$b"
    check "$b local branch deleted" bash -c "! git -C '$R' rev-parse --verify -q refs/heads/$b >/dev/null"
done
for b in unmerged lost dirty; do
    check "$b worktree kept" exists "$b"
    check "$b local branch kept" has_branch "$b"
done
check "main checkout intact" test -d "$R/.git"
check "main branch intact" has_branch main
check "dirty change preserved" contains "$(cat "$T/wt/dirty/base.txt")" more
check "no stale registration" test -z "$(g worktree list --porcelain | grep -F -- "$T/wt/merged-ff")"
check "remote refs untouched" bash -c "diff -r '$T/origin.git/refs' '$T/origin.before/refs' >/dev/null"

echo "# --all-repos"
mkdir "$T/scan"; ln -s "$R" "$T/scan/link"; git clone -q "$T/origin.git" "$T/scan/other" 2>/dev/null
git -C "$T/scan/other" worktree add -q -b scanwt "$T/wt/scanwt" origin/main
( cd "$T" && bash "$GC" --all-repos "$T/scan" ) >"$T/out" 2>"$T/err"; rc=$?
check "exit 0" test "$rc" = 0
check "scans repo dir, skips symlink" contains "$(cat "$T/out")" "== $T/scan/other"
check "scan lists scanwt as REMOVE" test "$(action scanwt)" = REMOVE
check "scan dry run keeps it" exists scanwt

echo "# usage"
( cd "$R" && bash "$GC" --bogus ) >/dev/null 2>&1; check "unknown flag -> exit 2" test "$?" = 2
( cd "$T" && bash "$GC" ) >/dev/null 2>&1; check "outside a repo -> exit 2" test "$?" = 2

finish
