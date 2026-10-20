#!/usr/bin/env bash
# Tests for hooks/auto-init-check.sh (SessionStart init advisory). Runs in temp dirs.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
HOOK="$HOOKS_DIR/auto-init-check.sh"

# newproj <name> [CLAUDE.md content] -> project with .claude/settings.json
newproj() {
    mkdir -p "$T/$1/.claude"; echo '{}' >"$T/$1/.claude/settings.json"
    [ $# -ge 2 ] && printf '%s\n' "$2" >"$T/$1/CLAUDE.md"
    echo "$T/$1"
}
hook_out() { local d="$1"; shift; env -u SCAFFOLDING_TASK_ID CLAUDE_PROJECT_DIR="$d" "$@" bash "$HOOK" 2>&1; }

echo "# (a) @-import only counts as initialized"
p="$(newproj imp '@~/.claude/CLAUDE.md')"
out="$(hook_out "$p")"
check "no advisory" test -z "$out"

echo "# (c) literal routing protocol counts as initialized"
p="$(newproj lit 'Task(subagent_type="scaffolding:developer", prompt="x")')"
out="$(hook_out "$p")"
check "no advisory" test -z "$out"

echo "# negative: CLAUDE.md without protocol or import still warns"
p="$(newproj plain '# My project')"
out="$(hook_out "$p")"
check "advisory emitted" contains "$out" "missing: CLAUDE.md routing protocol"

echo "# negative: no CLAUDE.md at all still warns"
p="$(newproj none)"
out="$(hook_out "$p")"
check "advisory emitted" contains "$out" "missing: CLAUDE.md routing protocol"

echo "# negative: mid-line '@' mention is not an import"
p="$(newproj mention 'see @foo about CLAUDE.md')"
out="$(hook_out "$p")"
check "advisory emitted" contains "$out" "missing:"

echo "# (b) SCAFFOLDING_TASK_ID set -> early exit, silent, no skeleton"
p="$(newproj plat '# My project')"
out="$(env CLAUDE_PROJECT_DIR="$p" SCAFFOLDING_TASK_ID=t-1 bash "$HOOK" 2>&1)"; rc=$?
check "exit 0" test "$rc" = 0
check "no output" test -z "$out"
check "no .scaffolding skeleton created" test ! -d "$p/.scaffolding"

finish
