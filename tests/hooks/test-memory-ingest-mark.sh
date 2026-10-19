#!/usr/bin/env bash
# memory-ingest-mark.sh must see context.md files through a symlinked conversations dir.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
U=11111111-1111-1111-1111-111111111111

mark() { echo '{"subagent_type":"developer"}' | CLAUDE_PROJECT_DIR="$1" bash "$HOOKS_DIR/memory-ingest-mark.sh"; }

echo "# symlinked conversations dir"
R="$T/linked"; mkdir -p "$R/.scaffolding" "$T/share/conv/$U/agent-memory"
ln -s "$T/share/conv" "$R/.scaffolding/conversations"
touch "$R/.scaffolding/.ingest-seen"; sleep 1
echo note >"$T/share/conv/$U/agent-memory/context.md"
check "exit 0" test "$(mark "$R" >/dev/null 2>&1; echo $?)" = 0
check "new context.md behind the link marks dirty" test -f "$R/.scaffolding/.ingest-dirty"
check "breadcrumb written" grep -q developer "$R/.scaffolding/.ingest-queue"

echo "# nothing newer than .ingest-seen: stays clean"
R2="$T/clean"; mkdir -p "$R2/.scaffolding"; cp -r "$T/share/conv" "$T/share/conv2"
ln -s "$T/share/conv2" "$R2/.scaffolding/conversations"; sleep 1; touch "$R2/.scaffolding/.ingest-seen"
mark "$R2" >/dev/null 2>&1
check "not marked dirty" test ! -f "$R2/.scaffolding/.ingest-dirty"

echo "# real (non-link) dir still works"
R3="$T/real"; mkdir -p "$R3/.scaffolding/conversations/$U/agent-memory"; touch "$R3/.scaffolding/.ingest-seen"; sleep 1
echo n >"$R3/.scaffolding/conversations/$U/agent-memory/context.md"
mark "$R3" >/dev/null 2>&1
check "marked dirty" test -f "$R3/.scaffolding/.ingest-dirty"

finish
