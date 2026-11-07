#!/usr/bin/env bash
# completion-nudge + memory-ingest (Stop hooks: loop guard, advisory vs block) and refresh-mcp-token.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

command -v node >/dev/null 2>&1 || { bad "node is required"; finish; exit; }
T="$(mktmp)"
trap 'rm -rf "$T"' EXIT

echo "# completion-nudge"
nudge() { # <stdin> [env...]
    local in="$1"; shift
    printf '%s' "$in" | env -u SCAFFOLDING_COMPLETION_NUDGE "$@" bash "$HOOKS_DIR/completion-nudge.sh" 2>"$T/err"; echo "rc=$?"
}
check "unset: silent no-op"          file_is_str "$(nudge '{}')$(cat "$T/err")" "rc=0"
out="$(nudge '{}' SCAFFOLDING_COMPLETION_NUDGE=1)"
check "advisory: checklist on stderr, nothing on stdout" file_is_str "$out" "rc=0"
check "advisory prints the checklist" contains "$(cat "$T/err")" "Completion check before yielding:"
nudge '{"stop_hook_active":true}' SCAFFOLDING_COMPLETION_NUDGE=1 >/dev/null
check "advisory + stop_hook_active: silent (loop guard)" test ! -s "$T/err"
out="$(nudge '{"stop_hook_active":false}' SCAFFOLDING_COMPLETION_NUDGE=block)"
check "block: valid JSON decision" file_is_str "$(printf '%s' "$out" | head -1 | jq -r .decision)" block
check "block: reason carries the checklist" contains "$(printf '%s' "$out" | head -1 | jq -r .reason)" "Any BLOCKED items left unreported?"
check "block: exit 0"                contains "$out" "rc=0"
check "block: python json.dumps separators" contains "$out" '{"decision": "block", "reason": "Completion check'
check "block: em dash is escaped (ensure_ascii)" contains "$out" 'commit \u2014 let it run'
check "block + stop_hook_active: silent (fires at most once)" file_is_str "$(nudge '{"stop_hook_active":true}' SCAFFOLDING_COMPLETION_NUDGE=block)" "rc=0"
check "block + malformed input still blocks once" contains "$(nudge '{oops' SCAFFOLDING_COMPLETION_NUDGE=block)" '"decision": "block"'
check "block + empty stdin still blocks once"     contains "$(nudge '' SCAFFOLDING_COMPLETION_NUDGE=block)" '"decision": "block"'
check "stop_hook_active uses python truthiness (string 'false' is truthy)" file_is_str "$(nudge '{"stop_hook_active":"false"}' SCAFFOLDING_COMPLETION_NUDGE=block)" "rc=0"
check "stop_hook_active 0 is falsy"  contains "$(nudge '{"stop_hook_active":0}' SCAFFOLDING_COMPLETION_NUDGE=block)" '"decision": "block"'

echo "# memory-ingest"
P="$T/proj"; mkdir -p "$P/.scaffolding"; touch "$P/.scaffolding/.ingest-dirty"
ingest() { printf '%s' "$1" | env -u SCAFFOLDING_MEMORY_INGEST CLAUDE_PROJECT_DIR="$P" "${@:2}" bash "$HOOKS_DIR/memory-ingest.sh" 2>"$T/err"; echo "rc=$?"; }
out="$(ingest '{}')"
check "advisory: directive on stderr, exit 0" file_is_str "$out" "rc=0"
check "advisory directive text"      contains "$(cat "$T/err")" "INGEST PAMIĘCI"
check "without project-id: no auto-store" contains "$(cat "$T/err")" "project_id NIEROZWIĄZANY"
echo 'scaffold:abc' >"$P/.scaffolding/project-id"
ingest '{}' >/dev/null
check "with project-id: store step names it" contains "$(cat "$T/err")" 'semantic_store(project_id="scaffold:abc"'
out="$(ingest '{}' SCAFFOLDING_MEMORY_INGEST=block)"
check "block: JSON decision"         file_is_str "$(printf '%s' "$out" | head -1 | jq -r .decision)" block
check "block: reason carries the directive" contains "$(printf '%s' "$out" | head -1 | jq -r .reason)" "INGEST PAMIĘCI"
check "block: unicode is escaped like json.dumps" contains "$out" 'INGEST PAMI\u0118CI'
check "block: stderr stays empty"    test ! -s "$T/err"
check "block + stop_hook_active: silent" file_is_str "$(ingest '{"stop_hook_active":true}' SCAFFOLDING_MEMORY_INGEST=block)" "rc=0"
ingest '{"stop_hook_active":true}' >/dev/null
check "advisory + stop_hook_active: silent" test ! -s "$T/err"
check "off: no-op"                   file_is_str "$(ingest '{}' SCAFFOLDING_MEMORY_INGEST=off)$(cat "$T/err")" "rc=0"
touch "$P/.scaffolding/.noingest"
check ".noingest: no-op"             file_is_str "$(ingest '{}' SCAFFOLDING_MEMORY_INGEST=block)" "rc=0"
rm "$P/.scaffolding/.noingest" "$P/.scaffolding/.ingest-dirty"
check "not dirty: no-op"             file_is_str "$(ingest '{}' SCAFFOLDING_MEMORY_INGEST=block)" "rc=0"

echo "# refresh-mcp-token"
H="$T/home"; mkdir -p "$H/.claude" "$T/vbin"
# shellcheck disable=SC2016  # the stub must expand FAKE_VAULT_TOKEN itself, not this shell
printf '#!/bin/sh\n[ -n "${FAKE_VAULT_TOKEN+x}" ] || exit 1\nprintf "%%s" "$FAKE_VAULT_TOKEN"\n' >"$T/vbin/vault"; chmod +x "$T/vbin/vault"
refresh() { HOME="$H" PATH="$T/vbin:$PATH" "$@" bash "$HOOKS_DIR/refresh-mcp-token.sh" >"$T/out" 2>&1; echo $?; }
echo '{"env":{"MEMORY_MCP_TOKEN":"old","K":"v"},"permissions":{"allow":["Bash"]}}' >"$H/.claude/settings.json"; chmod 644 "$H/.claude/settings.json"
check "vault failing: exit 0, token kept" test "$(refresh env)" = 0 -a "$(jq -r .env.MEMORY_MCP_TOKEN "$H/.claude/settings.json")" = old
check "token < 16 chars rejected"    test "$(refresh env FAKE_VAULT_TOKEN=short)" = 0 -a "$(jq -r .env.MEMORY_MCP_TOKEN "$H/.claude/settings.json")" = old
check "token containing 'Error' rejected" test "$(refresh env FAKE_VAULT_TOKEN=xxxxxxxxxxxxxxxxxxxxError)" = 0 -a "$(jq -r .env.MEMORY_MCP_TOKEN "$H/.claude/settings.json")" = old
check "valid token written"          test "$(refresh env FAKE_VAULT_TOKEN=brand-new-token-0123456789)" = 0 -a "$(jq -r .env.MEMORY_MCP_TOKEN "$H/.claude/settings.json")" = brand-new-token-0123456789
check "other settings preserved"     file_is_str "$(jq -c '[.env.K,.permissions.allow[0]]' "$H/.claude/settings.json")" '["v","Bash"]'
check "settings.json is mode 600"    file_is_str "$(stat -c %a "$H/.claude/settings.json")" 600
check "output is 2-space indented"   file_is_str "$(sed -n 2p "$H/.claude/settings.json")" '  "env": {'
check "no temp files left behind"    file_is_str "$(ls -A "$H/.claude")" settings.json
echo '{broken' >"$H/.claude/settings.json"
check "malformed settings untouched" test "$(refresh env FAKE_VAULT_TOKEN=brand-new-token-0123456789)" = 0 -a "$(cat "$H/.claude/settings.json")" = "{broken"

finish
