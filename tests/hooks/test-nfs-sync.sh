#!/usr/bin/env bash
# Tests for hooks/nfs-sync.sh (conversations linker). Everything runs in temp dirs.
# shellcheck disable=SC2012  # ls -d on our own mktemp paths is fine in tests
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
SYNC="$HOOKS_DIR/nfs-sync.sh"
SHARE="$T/share"
mkdir -p "$SHARE/projects"
export SCAFFOLDING_NFS_ROOT="$SHARE"
export SCAFFOLDING_NFS_PROBE_TIMEOUT=2 SCAFFOLDING_NFS_TIMEOUT=5

newrepo() { mkdir -p "$T/$1/.scaffolding"; echo "$T/$1"; }
run_link() { bash "$SYNC" link "$@" 2>"$T/stderr"; echo $? >"$T/rc"; }

echo "# already linked: no-op"
r="$(newrepo linked)"
mkdir -p "$SHARE/projects/linked/conversations/u1"
echo keep >"$SHARE/projects/linked/conversations/u1/context.json"
ln -s "$SHARE/projects/linked/conversations" "$r/.scaffolding/conversations"
before="$(stat -c '%i %Y' "$r/.scaffolding/conversations")"
out="$(bash "$SYNC" link "$r" 2>&1)"
check "exit 0" test "$(bash "$SYNC" link "$r" >/dev/null 2>&1; echo $?)" = 0
check "link unchanged" is_link_to "$r/.scaffolding/conversations" "$SHARE/projects/linked/conversations"
check "no output" test -z "$out"
check "same inode/mtime" test "$before" = "$(stat -c '%i %Y' "$r/.scaffolding/conversations")"
check "no backup created" test -z "$(ls -d "$r"/.scaffolding/conversations.pre-nfs-* 2>/dev/null)"
check "share data intact" file_is "$SHARE/projects/linked/conversations/u1/context.json" keep

echo "# fresh: absent conversations dir"
r="$(newrepo fresh)"
run_link "$r"
check "exit 0" test "$(cat "$T/rc")" = 0
check "linked" is_link_to "$r/.scaffolding/conversations" "$SHARE/projects/fresh/conversations"
check "target dir created" test -d "$SHARE/projects/fresh/conversations"

echo "# fresh: empty local dir (what auto-init creates)"
r="$(newrepo empty)"; mkdir "$r/.scaffolding/conversations"
run_link "$r"
check "linked" is_link_to "$r/.scaffolding/conversations" "$SHARE/projects/empty/conversations"
check "no backup for empty dir" test -z "$(ls -d "$r"/.scaffolding/conversations.pre-nfs-* 2>/dev/null)"

echo "# fresh: populated local dir, target absent"
r="$(newrepo fresh2)"
U=11111111-1111-1111-1111-111111111111
mkdir -p "$r/.scaffolding/conversations/$U/specs" "$r/.scaffolding/conversations/denon-notes"
echo '{"status":"drafting"}' >"$r/.scaffolding/conversations/$U/context.json"
echo design >"$r/.scaffolding/conversations/$U/specs/design.md"
echo n >"$r/.scaffolding/conversations/denon-notes/a.md"
run_link "$r"
S="$SHARE/projects/fresh2/conversations"
check "linked" is_link_to "$r/.scaffolding/conversations" "$S"
check "context.json copied" file_is "$S/$U/context.json" '{"status":"drafting"}'
check "spec copied" file_is "$S/$U/specs/design.md" design
check "non-UUID dir moved as is" file_is "$S/denon-notes/a.md" n
bak="$(ls -d "$r"/.scaffolding/conversations.pre-nfs-* 2>/dev/null | head -1)"
check "backup exists" test -d "$bak"
check "backup has originals" file_is "$bak/$U/specs/design.md" design
echo "# second run changes nothing"
snap="$(find "$S" "$bak" | sort | xargs stat -c '%n %i %Y' 2>/dev/null | md5sum)"
run_link "$r"
check "idempotent: tree unchanged" test "$snap" = "$(find "$S" "$bak" | sort | xargs stat -c '%n %i %Y' 2>/dev/null | md5sum)"
check "idempotent: one backup only" test "$(ls -d "$r"/.scaffolding/conversations.pre-nfs-* | wc -l)" = 1

echo "# merge: target already has data, conflict on one file"
r="$(newrepo merge)"
S="$SHARE/projects/merge/conversations"
mkdir -p "$S/$U/specs" "$S/22222222-2222-2222-2222-222222222222"
echo SHARE >"$S/$U/specs/design.md"
echo only-share >"$S/22222222-2222-2222-2222-222222222222/context.json"
mkdir -p "$r/.scaffolding/conversations/$U/specs" "$r/.scaffolding/conversations/33333333-3333-3333-3333-333333333333"
echo LOCAL >"$r/.scaffolding/conversations/$U/specs/design.md"
echo local-only >"$r/.scaffolding/conversations/$U/specs/tasks.md"
echo l3 >"$r/.scaffolding/conversations/33333333-3333-3333-3333-333333333333/context.json"
run_link "$r"
check "linked" is_link_to "$r/.scaffolding/conversations" "$S"
check "conflict: share copy kept" file_is "$S/$U/specs/design.md" SHARE
bak="$(ls -d "$r"/.scaffolding/conversations.pre-nfs-* | head -1)"
check "conflict: local copy preserved in backup" file_is "$bak/$U/specs/design.md" LOCAL
check "conflict listed on stderr" contains "$(cat "$T/stderr")" "design.md"
check "local-only file merged in" file_is "$S/$U/specs/tasks.md" local-only
check "local-only conversation merged in" file_is "$S/33333333-3333-3333-3333-333333333333/context.json" l3
check "share-only conversation untouched" file_is "$S/22222222-2222-2222-2222-222222222222/context.json" only-share

echo "# rollback: verification failure leaves local dir untouched, no link"
r="$(newrepo rollback)"
mkdir -p "$r/.scaffolding/conversations/$U"
echo data >"$r/.scaffolding/conversations/$U/context.json"
# Fake cp that silently copies nothing: verification must catch it.
FAKE="$T/fakebin"; mkdir -p "$FAKE"
printf '#!/bin/sh\nexit 0\n' >"$FAKE/cp"; chmod +x "$FAKE/cp"
PATH="$FAKE:$PATH" run_link "$r"
check "exit 0" test "$(cat "$T/rc")" = 0
check "still a real dir" test -d "$r/.scaffolding/conversations" -a ! -L "$r/.scaffolding/conversations"
check "local data intact" file_is "$r/.scaffolding/conversations/$U/context.json" data
check "no backup left" test -z "$(ls -d "$r"/.scaffolding/conversations.pre-nfs-* 2>/dev/null)"
check "warned" contains "$(cat "$T/stderr")" "verification failed"
echo "# rollback: ln failure restores the original dir"
r="$(newrepo rollback2)"
mkdir -p "$r/.scaffolding/conversations/$U"
echo data >"$r/.scaffolding/conversations/$U/context.json"
printf '#!/bin/sh\nexit 1\n' >"$FAKE/ln"; chmod +x "$FAKE/ln"; rm -f "$FAKE/cp"
PATH="$FAKE:$PATH" run_link "$r"
check "exit 0" test "$(cat "$T/rc")" = 0
check "original dir restored" file_is "$r/.scaffolding/conversations/$U/context.json" data
check "restored dir is real" test ! -L "$r/.scaffolding/conversations"
check "no backup left" test -z "$(ls -d "$r"/.scaffolding/conversations.pre-nfs-* 2>/dev/null)"
rm -f "$FAKE/ln"

echo "# foreign symlink untouched"
r="$(newrepo foreign)"
mkdir -p "$T/elsewhere"; ln -s "$T/elsewhere" "$r/.scaffolding/conversations"
run_link "$r"
check "still points elsewhere" is_link_to "$r/.scaffolding/conversations" "$T/elsewhere"
check "warned" contains "$(cat "$T/stderr")" "left untouched"

echo "# share missing: exit 0, no changes"
r="$(newrepo noshare)"; mkdir -p "$r/.scaffolding/conversations/$U"; echo x >"$r/.scaffolding/conversations/$U/context.json"
SCAFFOLDING_NFS_ROOT="$T/does-not-exist" run_link "$r"
check "exit 0" test "$(cat "$T/rc")" = 0
check "dir untouched" file_is "$r/.scaffolding/conversations/$U/context.json" x
check "warned" contains "$(cat "$T/stderr")" "unreachable"

echo "# --dry-run changes nothing"
r="$(newrepo dry)"; mkdir -p "$r/.scaffolding/conversations/$U"; echo x >"$r/.scaffolding/conversations/$U/context.json"
out="$(bash "$SYNC" link --dry-run "$r" 2>&1)"
check "real dir kept" test -d "$r/.scaffolding/conversations" -a ! -L "$r/.scaffolding/conversations"
check "no target created" test ! -e "$SHARE/projects/dry"
check "no backup" test -z "$(ls -d "$r"/.scaffolding/conversations.pre-nfs-* 2>/dev/null)"
check "reports plan" contains "$out" "would migrate"
r="$(newrepo dry2)"
out="$(bash "$SYNC" link --dry-run "$r" 2>&1)"
check "dry-run absent: no link" test ! -e "$r/.scaffolding/conversations"
check "dry-run absent: no target" test ! -e "$SHARE/projects/dry2"

echo "# pull: opt-in gate and child repos"
P="$T/parent"; mkdir -p "$P/.scaffolding" "$P/childA/.scaffolding" "$P/childA/.git" "$P/plain/.scaffolding" "$P/childB/.git"
( unset SCAFFOLDING_NFS_ROOT; CLAUDE_PROJECT_DIR="$P" bash "$SYNC" pull 2>/dev/null )
check "no opt-in: nothing linked" test ! -L "$P/.scaffolding/conversations"
CLAUDE_PROJECT_DIR="$P" bash "$SYNC" pull 2>/dev/null
check "project dir linked (basename rule)" is_link_to "$P/.scaffolding/conversations" "$SHARE/projects/parent/conversations"
check "child git repo with .scaffolding linked" is_link_to "$P/childA/.scaffolding/conversations" "$SHARE/projects/childA/conversations"
check "non-git child skipped" test ! -e "$P/plain/.scaffolding/conversations"
check "git child without .scaffolding skipped" test ! -e "$P/childB/.scaffolding"
check "pull stdout is empty (SessionStart context)" test -z "$(CLAUDE_PROJECT_DIR="$P" bash "$SYNC" pull 2>/dev/null)"
check "push is a no-op, exit 0" test "$(CLAUDE_PROJECT_DIR="$P" bash "$SYNC" push >/dev/null 2>&1; echo $?)" = 0

echo "# sentinel names the share; auto-detect only without env"
r="$(newrepo sentinel)"; echo "$SHARE" >"$r/.scaffolding/.nfs-sync"
( unset SCAFFOLDING_NFS_ROOT; CLAUDE_PROJECT_DIR="$r" bash "$SYNC" pull 2>/dev/null )
check "linked via sentinel path" is_link_to "$r/.scaffolding/conversations" "$SHARE/projects/sentinel/conversations"

echo "# worktree dirs are never linked as projects"
r="$(newrepo wtparent)"; mkdir -p "$r/.scaffolding/worktrees/abc123def456/.scaffolding"
echo "gitdir: x" >"$r/.scaffolding/worktrees/abc123def456/.git"
run_link "$r/.scaffolding/worktrees/abc123def456"
check "worktree skipped" test ! -L "$r/.scaffolding/worktrees/abc123def456/.scaffolding/conversations"

finish
