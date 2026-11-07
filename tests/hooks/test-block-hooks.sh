#!/usr/bin/env bash
# block-subagent / block-force-push / block-destructive-rm / block-env-write: exit 2 = deny, 0 = allow.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

command -v node >/dev/null 2>&1 || { bad "node is required"; finish; exit; }
T="$(mktmp)"
trap 'rm -rf "$T"' EXIT

# run <hook> <json>  -> sets RC and ERR
run() { printf '%s' "$2" | bash "$HOOKS_DIR/$1.sh" >"$T/out" 2>"$T/err"; RC=$?; ERR="$(cat "$T/err")"; }
cmdj() { jq -nc --arg c "$1" '{tool_input:{command:$c}}'; }
denied()  { run "$1" "$2"; [ "$RC" = 2 ] && [ -n "$ERR" ]; }
allowed() { run "$1" "$2"; [ "$RC" = 0 ] && [ -z "$ERR" ]; }

echo "# block-subagent"
for t in general-purpose explore; do
    check "denies $t" denied block-subagent "{\"tool_input\":{\"subagent_type\":\"$t\"}}"
done
check "message names the type" contains "$ERR" "subagent_type 'explore'"
for t in scaffolding:developer plan Explore "explore " ""; do
    check "allows '$t'" allowed block-subagent "{\"tool_input\":{\"subagent_type\":\"$t\"}}"
done
for bad in '' '{oops' '[]' 'null' '{"tool_input":null}' '{"tool_input":{"subagent_type":null}}'; do
    check "fails open on '$bad'" allowed block-subagent "$bad"
done

echo "# block-force-push"
for c in "git push --force" "git push --force-with-lease origin x" "git push -f" "git push -fu origin x" "git push -uf origin x" "git add . && git push --force"; do
    check "denies: $c" denied block-force-push "$(cmdj "$c")"
done
for c in "git push origin main" "git push -u origin feat/x" "git push --follow-tags" "git status --force" "echo --force"; do
    check "allows: $c" allowed block-force-push "$(cmdj "$c")"
done
for bad in '' '{oops' '[]' '{"tool_input":null}' '{"tool_input":{"command":5}}'; do
    check "fails open on '$bad'" allowed block-force-push "$bad"
done

echo "# block-destructive-rm"
for c in "rm -rf /" "rm -fr /" "rm -r -f /" "rm --recursive --force /" "rm -rf /etc" "rm -rf /etc/nginx" "rm -rf /var/log" \
         "rm -rf /usr/local" "rm -rf ." "rm -rf .." "rm -rf build /usr/lib" "sudo rm -rf /" "ls | xargs rm" "find . | xargs -I{} rm {}" \
         "rm -rf --no-preserve-root /"; do
    check "denies: $c" denied block-destructive-rm "$(cmdj "$c")"
done
check "message names the target" contains "$(printf '%s' "$(cmdj 'rm -rf /var/x')" | bash "$HOOKS_DIR/block-destructive-rm.sh" 2>&1)" "on '/var/x'"
for c in "rm -rf node_modules" "rm -rf /tmp/x" "rm -rf /etcetera" "rm -rf ./" "rm -rf ../x" "rm -r /" "rm -f /" "rm /etc/passwd" "ls | xargs echo" "echo hi"; do
    check "allows: $c" allowed block-destructive-rm "$(cmdj "$c")"
done
check "python-style split: NBSP separates arguments" denied block-destructive-rm "$(cmdj $'rm -rf\xc2\xa0/etc')"
for bad in '' '{oops' '[]' '{"tool_input":null}' '{"tool_input":{"command":["rm -rf /"]}}'; do
    check "fails open on '$bad'" allowed block-destructive-rm "$bad"
done

echo "# block-env-write"
for p in /p/.env /p/a/.env.local .env.production /p/.env.example; do
    check "denies Write $p" denied block-env-write "{\"tool_input\":{\"file_path\":\"$p\"}}"
done
for p in /p/.envrc /p/env.ts /p/foo.env /p/.env/config /p/src/a.ts; do
    check "allows Write $p" allowed block-env-write "{\"tool_input\":{\"file_path\":\"$p\"}}"
done
for c in "echo A=1 > .env" "echo A=1 >> .env.local" "echo A=1 | tee .env" "echo A=1 | tee -a .env"; do
    check "denies Bash: $c" denied block-env-write "$(cmdj "$c")"
done
for c in "cat .env" "echo A=1 | tee .envrc" "ls"; do
    check "allows Bash: $c" allowed block-env-write "$(cmdj "$c")"
done
# Known quirk kept 1:1 (see plan, decision 8): only the LAST line of a multi-line command is inspected.
check "Bash: redirect on the last line is denied" denied block-env-write "$(cmdj $'ls\necho A=1 > .env')"
check "Bash: redirect on an earlier line is NOT seen (quirk)" allowed block-env-write "$(cmdj $'echo A=1 > .env\nls')"
for bad in '' '{oops' '[]' '{"tool_input":null}'; do
    check "fails open on '$bad'" allowed block-env-write "$bad"
done

echo "# no python3 needed"
mkdir -p "$T/bin"; ln -s "$(command -v node)" "$T/bin/node"
for t in bash cat grep head tail basename sed tr; do ln -s "$(command -v $t)" "$T/bin/$t"; done
check "block-destructive-rm runs without python3 on PATH" test "$(printf '%s' "$(cmdj 'rm -rf /')" | PATH="$T/bin" bash "$HOOKS_DIR/block-destructive-rm.sh" 2>/dev/null; echo $?)" = 2

echo "# node missing: fail open with a message"
mkdir -p "$T/nonode"; for t in bash cat; do ln -s "$(command -v $t)" "$T/nonode/$t"; done
out="$(printf '%s' "$(cmdj 'rm -rf /')" | PATH="$T/nonode" bash "$HOOKS_DIR/block-destructive-rm.sh" 2>&1; echo "rc=$?")"
check "exit 0" contains "$out" "rc=0"
check "says node is missing" contains "$out" "node not found, block-destructive-rm not enforced"

finish
