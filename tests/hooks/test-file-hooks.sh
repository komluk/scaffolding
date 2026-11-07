#!/usr/bin/env bash
# file-size-warn, file-staleness-check/update, post-edit-format (PostToolUse / PreToolUse on Edit|Write).
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

command -v node >/dev/null 2>&1 || { bad "node is required"; finish; exit; }
T="$(mktmp)"
TASK="test-file-hooks-$$"
STORE="/tmp/scaffolding-mtime-$TASK.json"
trap 'rm -rf "$T" "$STORE"' EXIT
fj() { jq -nc --arg p "$1" '{tool_input:{file_path:$p}}'; }

echo "# file-size-warn"
seq 1 500 >"$T/s500"; seq 1 501 >"$T/s501"
sz() { printf '%s' "$(fj "$1")" | bash "$HOOKS_DIR/file-size-warn.sh" 2>&1; echo "rc=$?"; }
check "500 lines: silent"            file_is_str "$(sz "$T/s500")" "rc=0"
check "501 lines: advisory, exit 0"  contains "$(sz "$T/s501")" "ADVISORY: $T/s501 has 501 lines"
check "advisory never blocks"        contains "$(sz "$T/s501")" "rc=0"
check "missing file: silent"         file_is_str "$(sz "$T/nope")" "rc=0"
check "malformed input: silent"      file_is_str "$(printf '{oops' | bash "$HOOKS_DIR/file-size-warn.sh" 2>&1; echo "rc=$?")" "rc=0"
head -c 4000 /dev/zero >"$T/bin"
check "binary file: silent"          file_is_str "$(sz "$T/bin")" "rc=0"
seq 1 501 >"$T/-v"
check "dash-named file is a file, not a grep option" contains "$(cd "$T" && sz "-v")" "ADVISORY: -v has 501 lines"

echo "# file-staleness-check / update"
chk() { printf '%s' "$(fj "$1")" | SCAFFOLDING_TASK_ID="$TASK" bash "$HOOKS_DIR/file-staleness-check.sh" 2>&1; echo "rc=$?"; }
upd() { printf '%s' "$(fj "$1")" | SCAFFOLDING_TASK_ID="$TASK" bash "$HOOKS_DIR/file-staleness-update.sh" 2>&1; echo "rc=$?"; }
F="$T/f.txt"; echo hi >"$F"; touch -d @1700000000 "$F"
check "no task id: no-op"            file_is_str "$(printf '%s' "$(fj "$F")" | env -u SCAFFOLDING_TASK_ID bash "$HOOKS_DIR/file-staleness-check.sh" 2>&1; echo "rc=$?")" "rc=0"
check "first access allowed"         file_is_str "$(chk "$F")" "rc=0"
check "store records whole seconds as a string" file_is_str "$(jq -c --arg f "$F" '.[$f]' "$STORE")" '"1700000000"'
check "unchanged mtime allowed"      file_is_str "$(chk "$F")" "rc=0"
touch -d @1700000099 "$F"
out="$(chk "$F")"
check "external change blocked (exit 2)" contains "$out" "rc=2"
check "message names stored and current mtime" contains "$out" "stored mtime=1700000000, current mtime=1700000099"
check "update records the new mtime" contains "$(upd "$F")" "rc=0"
check "after update the check passes" file_is_str "$(chk "$F")" "rc=0"
check "new (missing) file allowed"   file_is_str "$(chk "$T/new.txt")" "rc=0"
check "malformed input allowed"      file_is_str "$(printf '{oops' | SCAFFOLDING_TASK_ID="$TASK" bash "$HOOKS_DIR/file-staleness-check.sh" 2>&1; echo "rc=$?")" "rc=0"
echo '{broken' >"$STORE"
check "corrupt store is reset, not fatal" file_is_str "$(chk "$F")" "rc=0"
check "store holds valid json again" test "$(jq -c 'length' "$STORE")" = 1
check "store format is shared with the backend (flat string map)" test "$(jq -r 'to_entries[0].value|type' "$STORE")" = string
echo '{"a": "1"}' >"$STORE"; chk "$F" >/dev/null
check "other entries are preserved" test "$(jq -r '.a' "$STORE")" = 1
check "unicode path is stored escaped like python" bash -c "echo '{}' >'$STORE'; touch '$T/zażółć.txt'; printf '%s' '$(fj "$T/zażółć.txt")' | SCAFFOLDING_TASK_ID='$TASK' bash '$HOOKS_DIR/file-staleness-check.sh'; grep -q 'za\\\\u017c\\\\u00f3\\\\u0142\\\\u0107' '$STORE'"

echo "# post-edit-format"
mkdir -p "$T/fmt/bin"; (
    cd "$T/fmt" || exit
    for t in ruff npx; do printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n' "$t" "$T/fmt" >"bin/$t"; chmod +x "bin/$t"; done
    for t in bash cat sed grep; do ln -sf "$(command -v $t)" "bin/$t"; done
    ln -sf "$(command -v node)" bin/node
)
fmt() { printf '%s' "$(fj "$1")" | (cd "$T/fmt" && env PATH="$T/fmt/bin" "$@" bash "$HOOKS_DIR/post-edit-format.sh" 2>&1; echo "rc=$?"); }
touch "$T/fmt/a.py" "$T/fmt/a.ts" "$T/fmt/a.md"
fmt_env() { local f="$1"; shift; printf '%s' "$(fj "$f")" | (cd "$T/fmt" && env PATH="$T/fmt/bin" "$@" bash "$HOOKS_DIR/post-edit-format.sh" 2>&1; echo "rc=$?"); }
rm -f "$T/fmt/calls"
check "gate off: nothing runs"       file_is_str "$(fmt_env "$T/fmt/a.py")" "rc=0"
check "gate off: formatter not called" test ! -e "$T/fmt/calls"
check ".py with gate on: exit 0"     file_is_str "$(fmt_env "$T/fmt/a.py" SCAFFOLDING_AUTOFORMAT=1)" "rc=0"
check ".py -> ruff format <file>"    file_is_str "$(cat "$T/fmt/calls")" "ruff format $T/fmt/a.py"
rm -f "$T/fmt/calls"
fmt_env "$T/fmt/a.ts" SCAFFOLDING_AUTOFORMAT=1 >/dev/null
check ".ts -> npx prettier"          file_is_str "$(cat "$T/fmt/calls")" "npx --no-install prettier --write $T/fmt/a.ts"
rm -f "$T/fmt/calls"
fmt_env "$T/fmt/a.md" SCAFFOLDING_AUTOFORMAT=1 >/dev/null
check ".md: no formatter"            test ! -e "$T/fmt/calls"
check "missing file: silent exit 0"  file_is_str "$(fmt_env "$T/fmt/none.py" SCAFFOLDING_AUTOFORMAT=1)" "rc=0"
touch "$T/fmt/-x.py" "$T/fmt/--version.ts"; rm -f "$T/fmt/calls"
fmt_env "-x.py" SCAFFOLDING_AUTOFORMAT=1 >/dev/null
check "dash-named .py reaches ruff as a path" file_is_str "$(cat "$T/fmt/calls")" "ruff format ./-x.py"
rm -f "$T/fmt/calls"; fmt_env "--version.ts" SCAFFOLDING_AUTOFORMAT=1 >/dev/null
check "dash-named .ts reaches prettier as a path" file_is_str "$(cat "$T/fmt/calls")" "npx --no-install prettier --write ./--version.ts"
check "malformed input: exit 0"      file_is_str "$(printf '{oops' | (cd "$T/fmt" && env PATH="$T/fmt/bin" SCAFFOLDING_AUTOFORMAT=1 bash "$HOOKS_DIR/post-edit-format.sh" 2>&1; echo "rc=$?"))" "rc=0"

finish
