#!/usr/bin/env bash
# Bypass regressions from the 2.37.0 security review (H1, M1-M8): every listed repro is denied, every listed
# false positive is allowed. Hooks: block-destructive-rm / block-force-push / block-env-write / block-subagent.
# shellcheck disable=SC2016  # single quotes are intentional: the payloads are literal shell text
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

command -v node >/dev/null 2>&1 || { bad "node is required"; finish; exit; }
T="$(mktmp)"
trap 'rm -rf "$T"' EXIT

run() { printf '%s' "$2" | bash "$HOOKS_DIR/$1.sh" >"$T/out" 2>"$T/err"; RC=$?; ERR="$(cat "$T/err")"; }
cmdj() { jq -nc --arg c "$1" '{tool_input:{command:$c}}'; }
cwdj() { jq -nc --arg c "$1" --arg d "$2" '{cwd:$d,tool_input:{command:$c}}'; }
denied()  { run "$1" "$2"; [ "$RC" = 2 ] && [ -n "$ERR" ]; }
allowed() { run "$1" "$2"; [ "$RC" = 0 ] && [ -z "$ERR" ]; }
deny_all()  { local h="$1"; shift; for c in "$@"; do check "$h denies: $c" denied "$h" "$(cmdj "$c")"; done; }
allow_all() { local h="$1"; shift; for c in "$@"; do check "$h allows: $c" allowed "$h" "$(cmdj "$c")"; done; }
rep() { local s=""; for ((k = 0; k < $2; k++)); do s+="$1"; done; printf '%s' "$s"; }

echo "# H1: quote-aware parens, arithmetic is not a heredoc, incomplete parse fails closed"
deny_all block-force-push 'echo $(echo ")"); git push -f' $'(( x = 1 << 2 ))\ngit push -f' $'let "x = 1 << 2"\ngit push -f'
deny_all block-destructive-rm 'echo "$(echo ")")"; rm -rf /' $'echo $[1<<2]\nrm -rf /' $'echo $((1<<2))\nrm -rf /' \
    $'let x=1<<2\nrm -rf /' "$(rep 'echo $(' 7)rm -rf /$(rep ')' 7)" "$(rep 'nice ' 13)rm -rf /" \
    "$(rep "bash -c '" 1)$(rep 'bash -c "' 1)eval eval eval eval eval eval rm -rf /\"'" \
    'echo "x; rm -rf /' $'cat <<EOF\nrm -rf /'
allow_all block-destructive-rm 'echo "hi' 'echo $((2*3))' $'echo $[1<<2]\nls'
check "incomplete-parse message says why" contains "$(printf '%s' "$(cmdj 'echo "x; rm -rf /')" | bash "$HOOKS_DIR/block-destructive-rm.sh" 2>&1)" "could not be parsed safely"

echo "# M8: linear parse, 256 KB cap, node failure blocks"
node -e 'process.stdout.write(JSON.stringify({tool_input:{command:"do ".repeat(80000)+"rm -rf /"}}))' >"$T/big.json"
s=$(date +%s%N); run block-destructive-rm "$(cat "$T/big.json")"; e=$(( ($(date +%s%N) - s) / 1000000 ))
check "240 KB of keywords before rm -rf /: denied" test "$RC" = 2
check "... in under 3 s (${e} ms)" test "$e" -lt 3000
node -e 'process.stdout.write(JSON.stringify({tool_input:{command:"do ".repeat(100000)+"rm -rf /"}}))' >"$T/huge.json"
check "300 KB input with rm: denied by the size cap" denied block-destructive-rm "$(cat "$T/huge.json")"
node -e 'process.stdout.write(JSON.stringify({tool_input:{command:"echo '"'"'"+"a".repeat(300000)+"'"'"'"}}))' >"$T/hugeok.json"
check "300 KB input without danger words: allowed" allowed block-destructive-rm "$(cat "$T/hugeok.json")"
cp -r "$HOOKS_DIR" "$T/h"; printf 'process.exit(3);\n' >"$T/h/lib/hook-io.mjs"
for h in block-destructive-rm block-force-push block-env-write; do
    out="$(printf '%s' "$(cmdj 'rm -rf x; git push; echo > .env')" | bash "$T/h/$h.sh" 2>&1; echo "rc=$?")"
    check "$h: node exits non-zero -> blocked" contains "$out" "rc=2"
done
check "message names the failure" contains "$out" "could not check"
out="$(printf '%s' "$(cmdj 'ls -la')" | bash "$T/h/block-destructive-rm.sh" 2>&1; echo "rc=$?")"
check "fast path still allows without calling node" file_is_str "$out" "rc=0"

echo "# M1: no bash-4-only expansions in hooks (macOS ships bash 3.2)"
check "no \${var,,} / \${var^^} in hooks/*.sh" test -z "$(grep -lE '\$\{[A-Za-z_]+(,,|\^\^)' "$HOOKS_DIR"/*.sh)"
for t in General-Purpose GENERAL-PURPOSE; do
    check "block-subagent denies $t" denied block-subagent "{\"tool_input\":{\"subagent_type\":\"$t\"}}"
done
for t in Explore EXPLORE; do
    check "block-subagent allows $t" allowed block-subagent "{\"tool_input\":{\"subagent_type\":\"$t\"}}"
done

echo "# M2/M3: git push abbreviations and -c config"
deny_all block-force-push 'git push --de origin main' 'git push --dele origin master' 'git push --mir' 'git push --mirr origin' \
    'git push --forc origin x' 'git push --force-w origin x' "git -c alias.p='push -f' p" 'git -c Alias.x=y x' \
    'git -c remote.origin.push=+refs/heads/*:refs/heads/* push' 'git -c remote.origin.mirror=true push' 'git -c help.autocorrect=1 psuh -f' \
    'git p$()ush -f' 'git -C . pu``sh --force'
allow_all block-force-push 'git -c user.name=x push origin feat' 'git push --dry-run origin main' 'git push --follow-tags origin x' \
    'git push --de origin feat/old'

echo "# M6: env-write"
deny_all block-env-write 'echo x <> .env' 'echo x > .e?v' 'echo x > .[e]nv' 'echo x > .en*' 'echo x > .{env,bak}' 'cp a .{env,x}' \
    'echo x | tee .E[N]V' 'truncate -s 0 .env' 'ln -s /tmp/x .env' 'ln -sf a /p/.env.local' 'curl -o .env http://x' 'curl -sSo .env http://x' \
    'curl --output=.env http://x' 'wget -O .env http://x' 'wget --output-document=.env http://x' 'dd if=x of=.env' 'echo x > {.,}env'
allow_all block-env-write 'echo x > .envrc' 'echo x > .e?x' 'ls .e*' 'cat .env*' 'echo x > *.log' 'curl -o out.json http://x' \
    'ln -s .env link' 'truncate -s 0 app.log' 'wget -O - http://x'
check "MultiEdit file_path .env denied" denied block-env-write '{"tool_name":"MultiEdit","tool_input":{"file_path":"/p/.env","edits":[]}}'

echo "# M7: rm"
deny_all block-destructive-rm 'rm -r /' 'rm -R /etc' 'rm --rec /' 'rm --recursive /usr' 'rm -rf /{etc,tmp}' 'rm -rf /e{t,x}c' \
    'rm -rf /Users' 'rm -rf /Applications' 'rm -rf /System/Library' 'rm -rf /Library' 'rm -rf /private/etc' 'rm -rf /private/var/db' \
    'rm -rf ~/.config' 'rm -rf ~/.gnupg' 'rm -rf ~/.local' 'rm -rf ~/.claude' 'rm -rf ~/.ssh' 'rm -rf .git' 'rm -rf ./.git' 'rm -r ~'
allow_all block-destructive-rm 'rm -f /' 'rm -rf /var/folders/xy/T/tmp.1' 'rm -rf /private/var/folders/x' 'rm -rf /var/tmp/build' \
    'rm -rf /usr/local/lib/node_modules/x' 'rm -rf vendor/x/.git' 'rm -rf /tmp/scratch/.git' 'rm -rf ~/.cache/x' 'rm -rf ~/tmp/x' \
    'rm -rf $HOME/Documents' 'rm -rf ~/.config/nvim' 'rm -r build'
git init -q "$T/repo"; mkdir -p "$T/repo/sub"
check "repo top-level .git (absolute) denied" denied block-destructive-rm "$(cwdj "rm -rf $T/repo/.git" "$T/repo/sub")"
check "repo top-level .git (relative ../.git) denied" denied block-destructive-rm "$(cwdj 'rm -rf ../.git' "$T/repo/sub")"
check "rm -rf * in \$HOME denied" denied block-destructive-rm "$(cwdj 'rm -rf *' "$HOME")"
check "rm -rf * in a project dir allowed" allowed block-destructive-rm "$(cwdj 'rm -rf *' "$T/repo/sub")"
check "relative path resolved against cwd (cwd=/, etc)" denied block-destructive-rm "$(cwdj 'rm -rf etc' /)"

echo "# M4/M5: word tricks and more wrappers"
deny_all block-destructive-rm 'r$()m -rf /' 'r``m -rf /' 'r$@m -rf /' 'r$*m -rf /' '{r,x}m -rf /' '/bin/r? -rf /' '/bin/r[m] -rf /' \
    "env -S 'rm -rf /'" "env --split-string='rm -rf /'" "bash <<< 'rm -rf /'" "su -c 'rm -rf /'" "su root -c 'rm -rf /'" \
    "script -c 'rm -rf /' /dev/null" 'function f { rm -rf /; }' 'coproc rm -rf /' 'chroot / rm -rf /' 'flock /tmp/l rm -rf /' \
    "flock /tmp/l -c 'rm -rf /'" 'watch rm -rf /' 'strace -f -o /tmp/t rm -rf /' 'taskset -c 0 rm -rf /' 'taskset 0x1 rm -rf /' \
    'find -L / -delete' 'find -H -O2 / -delete' 'find -D tree / -delete' $'$\'\\U00000072\'m -rf /'
deny_all block-force-push "env -S 'git push -f'"

finish
