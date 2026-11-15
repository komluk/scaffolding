#!/usr/bin/env bash
# lsp/launch.js: runs the real language server when it is on PATH, otherwise answers as a no-op LSP server so Claude
# Code does not print "its program wasn't found". Also guards that every plugin.json lspServers entry uses it.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
ROOT="$(cd "$HOOKS_DIR/.." && pwd)"
LAUNCH="$ROOT/lsp/launch.js"
PJ="$ROOT/.claude-plugin/plugin.json"
NODE="$(command -v node)"
T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/empty" "$T/bin"

echo "missing program: no-op LSP server"
check "launcher exists" test -f "$LAUNCH"
R="$("$NODE" "$ROOT/tests/hooks/lsp-client.mjs" "$LAUNCH" definitely-not-installed-lsp "$T/empty" 2>&1)"
j() { printf '%s' "$R" | jq -r "$1"; }
check "exits 0 after exit notification" [ "$(j .code)" = "0" ]
check "stdout holds only framed protocol messages" [ "$(j .clean)" = "true" ]
check "initialize id echoed" [ "$(j '.msgs[0].id')" = "1" ]
check "initialize replies with empty capabilities" [ "$(j '.msgs[0].result.capabilities | length')" = "0" ]
check "serverInfo names the missing program" [ "$(j '.msgs[0].result.serverInfo.name')" = "definitely-not-installed-lsp (not installed)" ]
check "unknown request gets -32601" [ "$(j '.msgs[1].error.code')" = "-32601" ]
check "unknown request id echoed" [ "$(j '.msgs[1].id')" = "2" ]
check "shutdown replies null" [ "$(j '.msgs[2] | [.id, .result, has("result"), has("error")] | @json')" = '[3,null,true,false]' ]
check "notifications get no reply (3 messages total)" [ "$(j '.msgs | length')" = "3" ]

echo "missing program: stdin EOF exits 0"
printf '' | PATH="$T/empty" "$NODE" "$LAUNCH" nope-lsp 2>/dev/null
check "EOF without an exit message exits 0" [ "$?" = "0" ]

echo "present program: the real server is run"
cat > "$T/bin/fake-lsp" <<'FAKE'
#!/usr/bin/env bash
printf 'args=%s\n' "$*" > "$FAKE_OUT"
IFS= read -r line
printf 'stdin=%s\n' "$line" >> "$FAKE_OUT"
printf 'from-fake\n'
exit 7
FAKE
chmod +x "$T/bin/fake-lsp"
OUT="$(printf 'hello\n' | FAKE_OUT="$T/fake.out" PATH="$T/bin:$PATH" "$NODE" "$LAUNCH" fake-lsp --stdio "two words" 2>/dev/null)"
rc=$?
check "child exit code propagates" [ "$rc" = "7" ]
check "child stdout is passed through untouched" [ "$OUT" = "from-fake" ]
check "args are passed verbatim" file_is_str "$(sed -n 1p "$T/fake.out")" "args=--stdio two words"
check "stdin is passed to the child" file_is_str "$(sed -n 2p "$T/fake.out")" "stdin=hello"

echo "present program: SIGTERM is forwarded"
cat > "$T/bin/slow-lsp" <<'SLOW'
#!/usr/bin/env bash
trap 'echo got-term > "$FAKE_OUT"; exit 3' TERM
echo ready > "$FAKE_OUT.ready"
while :; do sleep 0.1; done
SLOW
chmod +x "$T/bin/slow-lsp"
FAKE_OUT="$T/slow.out" PATH="$T/bin:$PATH" "$NODE" "$LAUNCH" slow-lsp </dev/null >/dev/null 2>&1 &
LP=$!
for _ in $(seq 100); do [ -f "$T/slow.out.ready" ] && break; sleep 0.1; done
kill -TERM "$LP"
wait "$LP"
rc=$?
check "child exit code propagated after SIGTERM" [ "$rc" = "3" ]
check "child ran its TERM trap" file_is "$T/slow.out" "got-term"

echo "refactor-guard: a launcher-wrapped entry counts only when its program is installed"
mkdir -p "$T/plug/.claude-plugin" "$T/ws/src"
printf 'export function foo() {}\n' > "$T/ws/src/a.ts"
printf '{"lspServers":{"ts":{"command":"node","args":["${CLAUDE_PLUGIN_ROOT}/lsp/launch.js","fake-ts-lsp","--stdio"],"extensionToLanguage":{".ts":"typescript"}}}}' > "$T/plug/.claude-plugin/plugin.json"
EDIT="{\"file_path\":\"$T/ws/src/a.ts\",\"old_string\":\"export function foo() {}\",\"new_string\":\"export function foo2() {}\"}"
guard() { # PATH-prefix -> hook stdout, REFACTOR_GUARD_LSP unset so coverage is derived from plugin.json + PATH
    printf '{"tool_name":"Edit","transcript_path":"%s","cwd":"%s","tool_input":%s}' "$T/none.jsonl" "$T/ws" "$EDIT" |
        env -u REFACTOR_GUARD_LSP SCAFFOLDING_REFACTOR_GUARD=warn CLAUDE_PLUGIN_ROOT="$T/plug" PATH="$1:$PATH" bash "$HOOKS_DIR/refactor-guard.sh"
}
printf '#!/bin/sh\nexit 0\n' > "$T/bin/fake-ts-lsp"
chmod +x "$T/bin/fake-ts-lsp"
check "program missing -> not covered (warning says no LSP server)" contains "$(guard "$T/empty")" "no LSP server covers"
check "program on PATH -> covered (no 'no LSP server' note)" test -z "$(guard "$T/bin" | grep -F 'no LSP server covers')"

echo "plugin.json: every lspServers entry goes through the launcher"
check "lspServers has 16 entries" [ "$(jq '.lspServers | length' "$PJ")" = "16" ]
check "every command is node" [ "$(jq '[.lspServers[] | select(.command != "node")] | length' "$PJ")" = "0" ]
check "every args[0] is the launcher" [ "$(jq '[.lspServers[] | select(.args[0] != "${CLAUDE_PLUGIN_ROOT}/lsp/launch.js")] | length' "$PJ")" = "0" ]
check "every entry names the wrapped program" [ "$(jq '[.lspServers[] | select((.args[1] // "") == "")] | length' "$PJ")" = "0" ]
check "extensionToLanguage kept on every entry" [ "$(jq '[.lspServers[] | select((.extensionToLanguage | length) == 0)] | length' "$PJ")" = "0" ]
progs=$(jq -r '[.lspServers[].args[1]] | sort | join(",")' "$PJ")
want="bash-language-server,csharp-ls,dart-language-server,docker-langserver,gopls,marksman,postgres-language-server,pyright-langserver,rust-analyzer,taplo,terraform-ls,typescript-language-server,vscode-css-language-server,vscode-html-language-server,vscode-json-language-server,yaml-language-server"
check "wrapped programs are the original 16" file_is_str "$progs" "$want"

finish
