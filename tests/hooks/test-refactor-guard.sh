#!/usr/bin/env bash
# refactor-guard: DENY (default) / warn / off on rename/delete of an exported symbol without prior
# LSP findReferences / graphify evidence in the transcript; fast; env overrides work.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
ROOT="$(cd "$HOOKS_DIR/.." && pwd)"
HOOK="$HOOKS_DIR/refactor-guard.sh"
T=$(mktmp); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/src"
printf 'export function foo() {}\nexport const bar = 1;\n' > "$T/src/a.ts"
printf 'def keep():\n    pass\n' > "$T/src/m.py"

: > "$T/empty.jsonl"
tu() { printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"%s","input":%s}]}}\n' "$1" "$2"; }
tu LSP "{\"operation\":\"findReferences\",\"filePath\":\"$T/src/a.ts\",\"line\":1,\"character\":17}" > "$T/lsp.jsonl"
tu LSP "{\"operation\":\"hover\",\"filePath\":\"$T/src/a.ts\",\"line\":1,\"character\":17}" > "$T/hover.jsonl"
tu mcp__graphify__get_neighbors '{"node":"foo"}' > "$T/graph.jsonl"
tu mcp__graphify__get_neighbors '{"node":"unrelated"}' > "$T/graph-other.jsonl"

run() { # legacy warn-mode helper: transcript tool_input_json [tool=Edit] -> stdout
    printf '{"tool_name":"%s","transcript_path":"%s","tool_input":%s}' "${3:-Edit}" "$1" "$2" | SCAFFOLDING_REFACTOR_GUARD="${SCAFFOLDING_REFACTOR_GUARD:-warn}" REFACTOR_GUARD_LSP="${LSP:-on}" bash "$HOOK"
}
dny() { # transcript tool_input_json [tool=Edit] [cwd] -> stdout (default mode = deny)
    printf '{"tool_name":"%s","transcript_path":"%s","cwd":"%s","tool_input":%s}' "${3:-Edit}" "$1" "${4:-$T}" "$2" | REFACTOR_GUARD_LSP="${LSP:-on}" bash "$HOOK"
}
decision() { printf '%s' "$1" | jq -r '.hookSpecificOutput.permissionDecision // "none"' 2>/dev/null; }
EDIT_RENAME="{\"file_path\":\"$T/src/a.ts\",\"old_string\":\"export function foo() {}\",\"new_string\":\"export function foo2() {}\"}"

echo "# warns"
out=$(run "$T/empty.jsonl" "$EDIT_RENAME")
check "rename exported fn without evidence -> warning" contains "$out" "additionalContext"
check "warning names the symbol" contains "$out" '`foo`'
check "warning lists LSP findReferences" contains "$out" "findReferences"
check "warning lists graphify tool names" contains "$out" "mcp__graphify__get_neighbors"
check "warning is JSON with PreToolUse event" test "$(printf '%s' "$out" | jq -r .hookSpecificOutput.hookEventName)" = PreToolUse
check "warn mode never denies (no permissionDecision)" test "$(printf '%s' "$out" | jq 'has("hookSpecificOutput") and (.hookSpecificOutput|has("permissionDecision"))')" = false
out=$(run "$T/empty.jsonl" "{\"file_path\":\"$T/src/a.ts\",\"old_string\":\"export const bar = 1;\",\"new_string\":\"\"}")
check "delete exported const -> warning" contains "$out" '`bar`'
out=$(run "$T/empty.jsonl" "{\"file_path\":\"$T/src/m.py\",\"edits\":[{\"old_string\":\"def keep():\",\"new_string\":\"def kept():\"}]}" MultiEdit)
check "MultiEdit python def rename -> warning" contains "$out" '`keep`'
out=$(run "$T/empty.jsonl" "{\"file_path\":\"$T/src/a.ts\",\"content\":\"export const bar = 1;\\n\"}" Write)
check "Write dropping exported fn -> warning" contains "$out" '`foo`'
out=$(run "$T/empty.jsonl" "{\"command\":\"sed -i 's/foo/foo2/' $T/src/a.ts\"}" Bash)
check "sed -i rename of exported symbol -> warning" contains "$out" '`foo`'
out=$(run "$T/empty.jsonl" "{\"command\":\"perl -pi -e 's/foo/foo2/' $T/src/a.ts\"}" Bash)
check "perl -pi rename of exported symbol -> warning" contains "$out" '`foo`'
out=$(run "$T/hover.jsonl" "$EDIT_RENAME")
check "LSP hover (not findReferences) is not evidence" contains "$out" "additionalContext"
out=$(run "$T/graph-other.jsonl" "$EDIT_RENAME")
check "graphify call on a different symbol is not evidence" contains "$out" "additionalContext"

echo "# language without LSP server"
out=$(LSP=off run "$T/empty.jsonl" "$EDIT_RENAME")
check "no LSP -> suggests graphify or grep" contains "$out" "grep -rnw"

echo "# silent"
check "LSP findReferences on the file -> silent" test -z "$(run "$T/lsp.jsonl" "$EDIT_RENAME")"
check "graphify call naming the symbol -> silent" test -z "$(run "$T/graph.jsonl" "$EDIT_RENAME")"
check "body-only edit (symbol kept) -> silent" test -z "$(run "$T/empty.jsonl" "{\"file_path\":\"$T/src/a.ts\",\"old_string\":\"export function foo() {}\",\"new_string\":\"export function foo() { return 1; }\"}")"
check "non-exported local -> silent" test -z "$(run "$T/empty.jsonl" "{\"file_path\":\"$T/src/a.ts\",\"old_string\":\"function helper() {}\",\"new_string\":\"function helper2() {}\"}")"
check "test file -> silent" test -z "$(run "$T/empty.jsonl" "{\"file_path\":\"$T/src/a.test.ts\",\"old_string\":\"export function foo() {}\",\"new_string\":\"\"}")"
check "non-code file -> silent" test -z "$(run "$T/empty.jsonl" "{\"file_path\":\"$T/README.md\",\"old_string\":\"export function foo() {}\",\"new_string\":\"\"}")"
check "sed -i without rename of exported symbol -> silent" test -z "$(run "$T/empty.jsonl" "{\"command\":\"sed -i 's/zzz/yyy/' $T/src/a.ts\"}" Bash)"
check "plain sed (no -i) -> silent" test -z "$(run "$T/empty.jsonl" "{\"command\":\"sed 's/foo/foo2/' $T/src/a.ts\"}" Bash)"
check "SCAFFOLDING_REFACTOR_GUARD=off -> silent" test -z "$(SCAFFOLDING_REFACTOR_GUARD=off run "$T/empty.jsonl" "$EDIT_RENAME")"

echo "# deny (default mode)"
# workspace fixture for xargs / $(...) renames
W="$T/ws"; mkdir -p "$W/src" "$W/node_modules/x"
printf 'export function createPlatformOutcomes() {}\nfunction localThing() {}\n' > "$W/src/out.ts"
printf 'import { createPlatformOutcomes } from "./out";\ncreatePlatformOutcomes();\nconst localThing2 = 1;\n' > "$W/src/use.ts"
printf 'export function createPlatformOutcomes() {}\n' > "$W/node_modules/x/ignored.ts"
printf 'createPlatformOutcomes docs\n' > "$W/NOTES.md"
tu LSP "{\"operation\":\"findReferences\",\"filePath\":\"$W/src/out.ts\",\"line\":1,\"character\":17}" > "$T/ws-lsp.jsonl"
tu mcp__graphify__query_graph '{"question":"who uses createPlatformOutcomes"}' > "$T/ws-graph.jsonl"
PROD="{\"command\":\"grep -rlw \\\"createPlatformOutcomes\\\" . --include=*.ts | xargs sed -i 's/\\\\bcreatePlatformOutcomes\\\\b/createPlatformOutcomeTracker/g'\"}"
out=$(dny "$T/empty.jsonl" "$PROD" Bash "$W")
check "prod grep|xargs sed -i \\b rename, no evidence -> deny" test "$(decision "$out")" = deny
check "deny reason names LSP findReferences + filePath/line/character" contains "$out" 'operation=findReferences, filePath=\"'"$W"'/src/out.ts\", line=1, character=17'
check "deny reason names graphify + Edit alternative" contains "$out" "mcp__graphify__get_neighbors"
check "deny reason offers retry-after-findReferences" contains "$out" "retry the same sed"
check "prod command + LSP findReferences on defining file -> allowed" test -z "$(dny "$T/ws-lsp.jsonl" "$PROD" Bash "$W")"
check "prod command + graphify query naming symbol -> allowed" test -z "$(dny "$T/ws-graph.jsonl" "$PROD" Bash "$W")"
check "evidence for another symbol does not allow" test "$(decision "$(dny "$T/graph-other.jsonl" "$PROD" Bash "$W")")" = deny
out=$(dny "$T/empty.jsonl" "{\"command\":\"sed -i 's/\\\\bcreatePlatformOutcomes\\\\b/Renamed/g' \$(grep -rl createPlatformOutcomes src)\"}" Bash "$W")
check "sed -i ... \$(grep -rl ...) -> deny" test "$(decision "$out")" = deny
check "\$(...) form allowed with evidence" test -z "$(dny "$T/ws-lsp.jsonl" "{\"command\":\"sed -i 's/\\\\bcreatePlatformOutcomes\\\\b/Renamed/g' \$(grep -rl createPlatformOutcomes src)\"}" Bash "$W")"
out=$(dny "$T/empty.jsonl" "{\"command\":\"grep -rl createPlatformOutcomes . | xargs sed -i 's/\\\\<createPlatformOutcomes\\\\>/Renamed/g'\"}" Bash "$W")
check "\\< \\> anchors -> deny" test "$(decision "$out")" = deny
out=$(dny "$T/empty.jsonl" "{\"command\":\"sed -i 's|createPlatformOutcomes|Renamed|g' src/use.ts src/out.ts\"}" Bash "$W")
check "explicit code files, other delimiter -> deny" test "$(decision "$out")" = deny
check "workspace scan skips node_modules" test "$(printf '%s' "$out" | grep -c node_modules)" = 0
check "non-exported local variable via xargs -> allowed" test -z "$(dny "$T/empty.jsonl" "{\"command\":\"grep -rl localThing2 . | xargs sed -i 's/\\\\blocalThing2\\\\b/other/g'\"}" Bash "$W")"
check "non-exported local function via xargs -> allowed" test -z "$(dny "$T/empty.jsonl" "{\"command\":\"grep -rl localThing . | xargs sed -i 's/\\\\blocalThing\\\\b/other/g'\"}" Bash "$W")"
check "sed -i on a non-code file -> allowed" test -z "$(dny "$T/empty.jsonl" "{\"command\":\"sed -i 's/\\\\bcreatePlatformOutcomes\\\\b/Renamed/g' NOTES.md\"}" Bash "$W")"
out=$(dny "$T/empty.jsonl" "$EDIT_RENAME")
check "Edit rename of exported symbol, no evidence -> deny" test "$(decision "$out")" = deny
check "Edit deny reason has exact LSP args" contains "$out" "line=1, character=17"
out=$(dny "$T/empty.jsonl" "{\"file_path\":\"$T/src/a.ts\",\"content\":\"export const bar = 1;\\n\"}" Write)
check "Write dropping exported fn -> deny" test "$(decision "$out")" = deny
out=$(dny "$T/empty.jsonl" "{\"file_path\":\"$T/src/m.py\",\"edits\":[{\"old_string\":\"def keep():\",\"new_string\":\"def kept():\"}]}" MultiEdit)
check "MultiEdit rename -> deny" test "$(decision "$out")" = deny
check "Edit rename with findReferences evidence -> allowed" test -z "$(dny "$T/lsp.jsonl" "$EDIT_RENAME")"
out=$(LSP=off dny "$T/empty.jsonl" "$EDIT_RENAME")
check "no LSP server for language -> warn, not deny" test "$(decision "$out")" = none
check "no LSP fallback still warns" contains "$out" "additionalContext"

echo "# modes"
out=$(SCAFFOLDING_REFACTOR_GUARD=warn dny "$T/empty.jsonl" "$PROD" Bash "$W")
check "warn mode on prod command -> additionalContext only" contains "$out" "additionalContext"
check "warn mode does not deny" test "$(decision "$out")" = none
check "off mode on prod command -> silent" test -z "$(SCAFFOLDING_REFACTOR_GUARD=off dny "$T/empty.jsonl" "$PROD" Bash "$W")"
check "off mode on Edit -> silent" test -z "$(SCAFFOLDING_REFACTOR_GUARD=off dny "$T/empty.jsonl" "$EDIT_RENAME")"
s=$(date +%s%N); dny "$T/empty.jsonl" "$PROD" Bash "$W" >/dev/null; e=$(( ($(date +%s%N) - s) / 1000000 ))
check "workspace scan stays within budget (${e} ms)" test "$e" -lt 600

echo "# robustness"
printf 'not json' | bash "$HOOK" >/dev/null 2>&1; check "malformed stdin exits 0" test $? = 0
check "missing transcript -> still warns, exit 0" contains "$(run "$T/nope.jsonl" "$EDIT_RENAME")" "additionalContext"
s=$(date +%s%N); run "$T/empty.jsonl" "$EDIT_RENAME" >/dev/null; e=$(( ($(date +%s%N) - s) / 1000000 ))
check "runs under 200 ms (${e} ms)" test "$e" -lt 200

echo "# registration"
PJ="$ROOT/.claude-plugin/plugin.json"
for m in "Edit|Write|MultiEdit" "Bash"; do
    check "PreToolUse[$m] -> refactor-guard.sh" test "$(jq --arg m "$m" '[.hooks.PreToolUse[]|select(.matcher==$m)|.hooks[].command|select(endswith("/hooks/refactor-guard.sh"))]|length' "$PJ")" = 1
done
check "refactor-guard.sh is executable" test -x "$HOOK"
check "plugin version is 2.30.0" test "$(jq -r .version "$PJ")" = 2.30.0
finish
