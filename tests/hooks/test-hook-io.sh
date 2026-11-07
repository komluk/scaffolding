#!/usr/bin/env bash
# hooks/lib/hook-io.mjs: the JSON helper the ported hooks call (get / quote / emit-block / rm-target / set-env).
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

command -v node >/dev/null 2>&1 || { bad "node is required"; finish; exit; }
IO="$HOOKS_DIR/lib/hook-io.mjs"
T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
io() { node "$IO" "$@"; }

echo "# get"
check "nested field"                    file_is_str "$(echo '{"tool_input":{"command":"ls"}}' | io get tool_input.command)" "ls"
check "missing field is empty"          file_is_str "$(echo '{}' | io get tool_input.command)" ""
check "missing parent is empty"         file_is_str "$(echo '{"tool_input":{}}' | io get tool_input.command)" ""
check "default when key missing"        file_is_str "$(echo '{}' | io get name=worktree)" "worktree"
check "default not used when present"   file_is_str "$(echo '{"name":"x"}' | io get name=worktree)" "x"
check "default not used for empty string" file_is_str "$(echo '{"name":""}' | io get name=worktree)" ""
check "|| default used for empty/null"  file_is_str "$(echo '{"t":null}' | io get 't||task')" "task"
check "malformed json -> empty"         file_is_str "$(echo '{nope' | io get a)" ""
check "empty stdin -> empty"            file_is_str "$(io get a </dev/null)" ""
check "non-object parent -> empty"      file_is_str "$(echo '{"tool_input":"x"}' | io get tool_input.command)" ""
check "two fields, two lines"           file_is_str "$(echo '{"a":"1","b":"2"}' | io get a b | tr '\n' ,)" "1,2,"
check "python print() of non-strings"   file_is_str "$(echo '{"a":null,"b":true,"c":1.0,"d":[1,"x"]}' | io get a b c d | tr '\n' ,)" "None,True,1.0,[1, 'x'],"
check "--ti falls back to the root"     file_is_str "$(echo '{"file_path":"/a"}' | io get --ti file_path)" "/a"
check "--ti prefers tool_input"         file_is_str "$(echo '{"file_path":"/a","tool_input":{"file_path":"/b"}}' | io get --ti file_path)" "/b"
check "invalid utf-8 elsewhere is tolerated" file_is_str "$(printf '{"x":"\xff","a":"ok"}' | io get a)" "ok"
check "--nul keeps newlines inside a value" file_is_str "$(printf '%s' '{"a":"x\ny"}' | io get --nul a | tr '\0' '|')" "x
y|"

echo "# get --bool (python truthiness)"
for v in true 1 '"x"' '[0]' '{"a":1}' NaN; do
    check "truthy $v" file_is_str "$(echo "{\"s\":$v}" | io get --bool s)" "true"
done
for v in false 0 0.0 '""' '[]' '{}' null; do
    check "falsy $v" file_is_str "$(echo "{\"s\":$v}" | io get --bool s)" "false"
done
check "missing -> false"                file_is_str "$(echo '{}' | io get --bool s)" "false"
check "malformed -> false"              file_is_str "$(echo '{x' | io get --bool s)" "false"

echo "# quote / emit-block (json.dumps compatible)"
check "quote escapes like json.dumps (ensure_ascii)" file_is_str "$(printf 'a "b" \\ — ą 😀\n\tz' | io quote)" '"a \"b\" \\ \u2014 \u0105 \ud83d\ude00\n\tz"'
check "quote does not strip the trailing newline" file_is_str "$(printf 'x\n' | io quote)" '"x\n"'
check "quote keeps lone CR and CRLF (python stdin.read() on a pipe does not translate)" file_is_str "$(printf 'a\rb\r\nc\r' | io quote)" '"a\rb\r\nc\r"'
check "emit-block keeps CR and CRLF in the reason" file_is_str "$(printf 'a\rb\r\nc' | io emit-block)" '{"decision": "block", "reason": "a\rb\r\nc"}'
check "emit-block --guard keeps CR and CRLF in the reason" file_is_str "$(printf '{}\0a\rb\r\nc' | io emit-block --guard stop_hook_active)" '{"decision": "block", "reason": "a\rb\r\nc"}'
check "emit-block uses python separators" file_is_str "$(printf 'why — not' | io emit-block)" '{"decision": "block", "reason": "why \u2014 not"}'
check "emit-block --guard prints when inactive"  file_is_str "$(printf '{"stop_hook_active":false}\0r' | io emit-block --guard stop_hook_active)" '{"decision": "block", "reason": "r"}'
check "emit-block --guard silent when active"    file_is_str "$(printf '{"stop_hook_active":true}\0r' | io emit-block --guard stop_hook_active)" ''
check "emit-block --guard treats bad json as inactive" file_is_str "$(printf '{oops\0r' | io emit-block --guard stop_hook_active)" '{"decision": "block", "reason": "r"}'

echo "# parse depth (python fails open at ~10k-58k levels; the parser has no limit)"
deep="$(node -e 'const d=100000;process.stdout.write("{\"x\":"+"[".repeat(d)+"]".repeat(d)+",\"tool_input\":{\"command\":\"rm -rf /\"}}")')"
check "100000-deep payload still yields the command" file_is_str "$(printf '%s' "$deep" | io get tool_input.command)" "rm -rf /"

echo "# rm-target"
rmt() { printf '%s' "$1" | io rm-target | tr '\0' '|'; }
check "root"                    file_is_str "$(rmt '{"tool_input":{"command":"rm -rf /"}}')" "rm -rf /|/|"
check "/etc subtree"            file_is_str "$(rmt '{"tool_input":{"command":"rm -rf /etc/x"}}')" "rm -rf /etc/x|/etc/x|"
check "/etcetera is not /etc"   file_is_str "$(rmt '{"tool_input":{"command":"rm -rf /etcetera"}}')" "rm -rf /etcetera||"
check "dot and dot-dot"         file_is_str "$(rmt '{"tool_input":{"command":"rm -rf a .."}}')" "rm -rf a ..|..|"
check "nothing protected"       file_is_str "$(rmt '{"tool_input":{"command":"rm -rf build"}}')" "rm -rf build||"
check "malformed json"          file_is_str "$(rmt '{x')" "||"

echo "# set-env (refresh-mcp-token)"
S="$T/settings.json"
echo '{"env":{"A":"1"},"x":[1,{"y":null}]}' >"$S"; chmod 644 "$S"
TOK="new-token-0123456789" io set-env "$S" MEMORY_MCP_TOKEN TOK
check "token written, rest kept" file_is_str "$(jq -c '[.env.A,.env.MEMORY_MCP_TOKEN,.x[1].y]' "$S")" '["1","new-token-0123456789",null]'
check "file mode is 600"         file_is_str "$(stat -c %a "$S")" "600"
check "no temp file left"        file_is_str "$(find "$T" -mindepth 1 -maxdepth 1 -printf '%f ')" "settings.json "
before="$(stat -c %Y-%i "$S")"; sleep 1
TOK="new-token-0123456789" io set-env "$S" MEMORY_MCP_TOKEN TOK
check "unchanged token is not rewritten" file_is_str "$(stat -c %Y-%i "$S")" "$before"
echo '{broken' >"$S"; TOK="t" io set-env "$S" K TOK
check "malformed settings left untouched" file_is_str "$(cat "$S")" "{broken"

finish
