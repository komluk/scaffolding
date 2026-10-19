#!/usr/bin/env bash
# Tests for hooks/worktree-create.sh and hooks/worktree-remove.sh (temp git repo).
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

REPO="$T/repo"
git init -q "$REPO" && git -C "$REPO" commit -q --allow-empty -m init
REPO="$(cd "$REPO" && pwd -P)"
mkdir -p "$T/share/conv" "$REPO/.scaffolding"
ln -s "$T/share/conv" "$REPO/.scaffolding/conversations"

create() { printf '{"cwd":"%s","name":"%s"}' "$1" "$2" | bash "$HOOKS_DIR/worktree-create.sh" 2>"$T/err"; }
remove() { printf '{"worktree_path":"%s"}' "$1" | bash "$HOOKS_DIR/worktree-remove.sh" 2>"$T/err"; echo $? >"$T/rc"; }

echo "# create under .scaffolding/worktrees"
out="$(create "$REPO" feat/x)"
WT="$(printf '%s\n' "$out" | tail -n1)"
check "path is .scaffolding/worktrees/<name with / -> +>" test "$WT" = "$REPO/.scaffolding/worktrees/feat+x"
check "worktree dir exists" test -d "$WT"
check "branch worktree-feat+x" git -C "$REPO" rev-parse --verify -q "worktree-feat+x"
check "nothing under .claude/worktrees" test ! -e "$REPO/.claude/worktrees"
check "registered with git" test -n "$(git -C "$REPO" worktree list --porcelain | grep -Fx "worktree $WT")"
check "conversations link points to the share target" is_link_to "$WT/.scaffolding/conversations" "$T/share/conv"
echo spec >"$WT/.scaffolding/conversations/spec.md"
check "write via worktree lands on the share" file_is "$T/share/conv/spec.md" spec

echo "# create again resumes"
check "resume returns same path" test "$(create "$REPO" feat/x | tail -n1)" = "$WT"

echo "# create without symlinked conversations: no link"
REPO2="$T/repo2"; git init -q "$REPO2" && git -C "$REPO2" commit -q --allow-empty -m init
WT2="$(create "$REPO2" plain | tail -n1)"
check "no conversations link when main has none" test ! -e "$WT2/.scaffolding/conversations"

echo "# remove"
remove "$WT"
check "exit 0" test "$(cat "$T/rc")" = 0
check "worktree removed" test ! -e "$WT"
check "share data survives worktree removal" file_is "$T/share/conv/spec.md" spec
check "no longer registered" test -z "$(git -C "$REPO" worktree list --porcelain | grep -Fx "worktree $WT")"

echo "# remove refuses registered worktrees outside .scaffolding/worktrees/"
OUTSIDE="$T/outside-wt"
git -C "$REPO" worktree add -q --no-track -B outside "$OUTSIDE" HEAD
remove "$OUTSIDE"
check "exit 0" test "$(cat "$T/rc")" = 0
check "outside worktree kept" test -d "$OUTSIDE"
check "refusal logged" contains "$(cat "$T/err")" "refusing"
OLD="$REPO/.claude/worktrees/legacy"
mkdir -p "$(dirname "$OLD")"
git -C "$REPO" worktree add -q --no-track -B legacy "$OLD" HEAD
remove "$OLD"
check "legacy .claude/worktrees path refused" test -d "$OLD"

echo "# remove ignores unregistered / missing paths"
mkdir -p "$REPO/.scaffolding/worktrees/not-a-worktree"
remove "$REPO/.scaffolding/worktrees/not-a-worktree"
check "unregistered dir untouched" test -d "$REPO/.scaffolding/worktrees/not-a-worktree"
remove "$T/missing"
check "missing path exit 0" test "$(cat "$T/rc")" = 0

finish
