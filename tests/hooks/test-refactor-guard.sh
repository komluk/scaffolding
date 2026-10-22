#!/usr/bin/env bash
# refactor-guard (WARN mode): warns on rename/delete of an exported symbol without prior
# LSP findReferences / graphify evidence in the transcript; never blocks; fast; opt-out works.
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

run() { # transcript tool_input_json [tool=Edit] -> stdout
    printf '{"tool_name":"%s","transcript_path":"%s","tool_input":%s}' "${3:-Edit}" "$1" "$2" | REFACTOR_GUARD_LSP="${LSP:-on}" bash "$HOOK"
}
EDIT_RENAME="{\"file_path\":\"$T/src/a.ts\",\"old_string\":\"export function foo() {}\",\"new_string\":\"export function foo2() {}\"}"

echo "# warns"
out=$(run "$T/empty.jsonl" "$EDIT_RENAME")
check "rename exported fn without evidence -> warning" contains "$out" "additionalContext"
check "warning names the symbol" contains "$out" '`foo`'
check "warning lists LSP findReferences" contains "$out" "findReferences"
check "warning lists graphify tool names" contains "$out" "mcp__graphify__get_neighbors"
check "warning is JSON with PreToolUse event" test "$(printf '%s' "$out" | jq -r .hookSpecificOutput.hookEventName)" = PreToolUse
check "never denies (no permissionDecision)" test "$(printf '%s' "$out" | jq 'has("hookSpecificOutput") and (.hookSpecificOutput|has("permissionDecision"))')" = false
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
check "plugin version is 2.29.0" test "$(jq -r .version "$PJ")" = 2.29.0
finish
