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
for t in general-purpose explore General-Purpose GENERAL-PURPOSE general-Purpose; do
    check "denies $t" denied block-subagent "{\"tool_input\":{\"subagent_type\":\"$t\"}}"
done
check "message names the type" contains "$ERR" "subagent_type 'general-Purpose'"
# explore keeps its exact-match intent: only the lower-case denylist entry; the built-in 'Explore' (quick file
# searches) stays allowed. scaffolding:* and plan are always allowed.
for t in scaffolding:developer scaffolding:general-purpose plan Plan Explore EXPLORE "explore " general_purpose ""; do
    check "allows '$t'" allowed block-subagent "{\"tool_input\":{\"subagent_type\":\"$t\"}}"
done
for bad in '' '{oops' '[]' 'null' '{"tool_input":null}' '{"tool_input":{"subagent_type":null}}'; do
    check "fails open on '$bad'" allowed block-subagent "$bad"
done

echo "# block-force-push"
for c in "git push --force" "git push --force-with-lease origin x" "git push -f" "git push -fu origin x" "git push -uf origin x" "git add . && git push --force" \
         "git push origin +main" "git push origin +HEAD:main" "git push origin '+refs/heads/*:refs/heads/*'" "git -c x=y push --force" \
         "git -C /tmp/r push -f origin main" "git --no-pager push --force" "git  push --force" "git push --mirror" "git push origin --delete main" \
         "git push origin -d master" "git push origin :main" "git push origin :refs/heads/master" "git push --force-if-includes" "sudo git push -f" \
         "bash -c 'git push -f'" "/usr/bin/git push -f" "echo ok; git push -f" $'ls\ngit push --force' "git push origin main -f" "git push -vf"; do
    check "denies: $c" denied block-force-push "$(cmdj "$c")"
done
for c in "git push origin main" "git push origin feature" "git push -u origin feat/x" "git push --follow-tags" "git status --force" "echo --force" \
         "git push origin --delete feat/old" "git push origin :feat/old" "git push -o ci.skip origin x" "git push origin fix-f" \
         "echo 'git push --force'" "git commit -m 'git push --force is blocked'" "git pull --force" "git push origin HEAD:refs/heads/x"; do
    check "allows: $c" allowed block-force-push "$(cmdj "$c")"
done
for bad in '' '{oops' '[]' '{"tool_input":null}' '{"tool_input":{"command":5}}'; do
    check "fails open on '$bad'" allowed block-force-push "$bad"
done
mkdir -p "$T/np"; for t in bash cat; do ln -sf "$(command -v $t)" "$T/np/$t"; done
check "fast path: no 'push' -> allowed without node" test "$(printf '%s' "$(cmdj 'git status')" | PATH="$T/np" bash "$HOOKS_DIR/block-force-push.sh" 2>&1; echo "rc=$?")" = "rc=0"

echo "# block-destructive-rm"
for c in "rm -rf /" "rm -fr /" "rm -r -f /" "rm --recursive --force /" "rm -rf /etc" "rm -rf /etc/nginx" "rm -rf /var/log" \
         "rm -rf /usr/local" "rm -rf ." "rm -rf .." "rm -rf build /usr/lib" "sudo rm -rf /" "ls | xargs rm" "find . | xargs -I{} rm {}" \
         "rm -rf --no-preserve-root /" "rm -rf ./" "rm -rf ~" "rm -rf ~/" "rm -rf \$HOME" "rm -rf \${HOME}" "rm -rf \"\$HOME\"" \
         "rm -rf ~/.ssh" "rm -rf \$HOME/.config" "rm -rf ../.." "rm -rf ../../" "rm -rf /*" "rm -rf ~/*" "rm -rf \"/\"" "rm -rf '/'" \
         "rm -rf \"/etc\"" "rm -rf //" "rm -rf //etc" "rm -rf /etc/.." "rm -rf /./" "rm -rf /tmp/../etc" "\\rm -rf /" "/bin/rm -rf /" \
         "/usr/bin/rm -rf /etc" "command rm -rf /" "sudo -u root rm -rf /" "env FOO=1 rm -rf /" "bash -c 'rm -rf /'" "sh -c \"rm -rf ~\"" \
         "ls | xargs sh -c 'rm -rf /'" "find / -delete" "find ~ -delete" "find /etc -exec rm -rf {} +" "rm -rf /home" "rm -rf /root" \
         "rm -rf /boot" "rm -rf /opt" "rm -rf /srv" "rm -rf /lib" "rm -rf /lib64" "rm -rf /bin" "rm -rf /sbin" "rm -rf .git" "rm -rf ./.git" \
         "rm -r /" "rm -rf /etc;" "rm -rf /etc&&ls" "timeout 5 rm -rf /" "rm -rf \$(echo x) /" "echo \"\$(rm -rf /)\"" \
         "cd x; rm -rf ~" "RM -rf /"; do
    check "denies: $c" denied block-destructive-rm "$(cmdj "$c")"
done
check "message names the target" contains "$(printf '%s' "$(cmdj 'rm -rf /var/x')" | bash "$HOOKS_DIR/block-destructive-rm.sh" 2>&1)" "on '/var/x'"
check "denies: multi-line, rm on line 1" denied block-destructive-rm "$(cmdj $'rm -rf /\nls')"
check "denies: \$HOME expands to the real home" denied block-destructive-rm "$(cmdj "rm -rf $HOME")"
for c in "rm -rf node_modules" "rm -rf ./dist" "rm file.txt" "rm -rf /tmp/x" "rm -rf /etcetera" "rm -rf ../x" "rm -rf /p/repo/.git" "rm -rf \$HOME/Documents" "rm -f /" \
         "rm /etc/passwd" "ls | xargs echo" "echo hi" "echo 'rm -rf /'" "rm -rf ~/proj/build" "rm -rf \$HOME/proj/node_modules" \
         "rm -rf /home/u/proj" "rm -rf .gitignore" "rm -rf build/.git-cache" "find . -name '*.pyc' -delete" "find /tmp/x -delete" \
         "rm -rf ./*" "rm -rf *" "git rm -rf --cached x" "npm run rm" "rmdir /etc" "rm -rf /var2"; do
    check "allows: $c" allowed block-destructive-rm "$(cmdj "$c")"
done
check "python-style split: NBSP separates arguments" denied block-destructive-rm "$(cmdj $'rm -rf\xc2\xa0/etc')"
for bad in '' '{oops' '[]' '{"tool_input":null}' '{"tool_input":{"command":["rm -rf /"]}}'; do
    check "fails open on '$bad'" allowed block-destructive-rm "$bad"
done
mkdir -p "$T/nr"; for t in bash cat; do ln -sf "$(command -v $t)" "$T/nr/$t"; done
check "fast path: no rm/unlink/-delete/shred/truncate -> allowed without node" test "$(printf '%s' "$(cmdj 'git status')" | PATH="$T/nr" bash "$HOOKS_DIR/block-destructive-rm.sh" 2>&1; echo "rc=$?")" = "rc=0"

echo "# block-env-write"
for p in /p/.env /p/a/.env.local .env.production /p/.env.example /p/.ENV /p/.Env.Local /p/.env/ "/p/x
/p/.env"; do
    check "denies Write $p" denied block-env-write "$(jq -nc --arg p "$p" '{tool_input:{file_path:$p}}')"
done
for p in /p/.envrc /p/env.ts /p/foo.env /p/.env/config /p/src/a.ts -.env -- /p/.env-local /p/.environment; do
    check "allows Write $p" allowed block-env-write "$(jq -nc --arg p "$p" '{tool_input:{file_path:$p}}')"
done
for c in "echo A=1 > .env" "echo A=1 >> .env.local" "echo A=1 | tee .env" "echo A=1 | tee -a .env" \
         "echo A=1 > .ENV" "echo A=1 >| .env" "echo A=1 > \".env\"" "echo A=1 > '.env'" "echo A=1 > ./.env" "echo A=1 > /p/.Env.local" \
         "echo A=1 2>>.env" "echo A=1 &> .env" "echo A=1 | tee -i .env" "echo A=1 | tee a .env" "echo A=1 | tee -a -- .env" \
         "cp .env.example .env" "cp -f x /p/.env.local" "cp -t /p .env.prod" "mv x .env" "install -m 600 x .env" \
         "sed -i s/a/b/ .env" "sed -i.bak -e s/a/b/ .env.local" "sed --in-place s/a/b/ .env" "sed -Ei s/a/b/ .ENV" \
         "perl -pi -e s/a/b/ .env" "perl -i.bak -pe s/a/b/ .env" "sudo tee .env" "bash -c 'echo x > .env'" \
         "cat > .env <<'EOF'
A=1
EOF" "\\cp x .env" "ls; echo x > .env"; do
    check "denies Bash: $c" denied block-env-write "$(cmdj "$c")"
done
for c in "cat .env" "echo A=1 | tee .envrc" "ls" "cp .env /tmp/backup.txt" "sed s/a/b/ .env" "sed -n p .env" "perl -pe s/a/b/ .env" \
         "grep KEY .env" "source .env" "echo A=1 > .envrc" "mv .env.local old.txt" "cp a b" "git diff -- .env.example"; do
    check "allows Bash: $c" allowed block-env-write "$(cmdj "$c")"
done
check "Bash: redirect on the last line is denied" denied block-env-write "$(cmdj $'ls\necho A=1 > .env')"
check "Bash: redirect on an earlier line is denied" denied block-env-write "$(cmdj $'echo A=1 > .env\nls')"
check "Bash: JSON-escaped .env is still seen" denied block-env-write '{"tool_input":{"command":"echo x > \u002eenv"}}'
for bad in '' '{oops' '[]' '{"tool_input":null}'; do
    check "fails open on '$bad'" allowed block-env-write "$bad"
done
mkdir -p "$T/nn"; for t in bash cat; do ln -sf "$(command -v $t)" "$T/nn/$t"; done
check "fast path: no .env in the input -> allowed without node" test "$(printf '%s' "$(cmdj 'ls -la')" | PATH="$T/nn" bash "$HOOKS_DIR/block-env-write.sh" 2>&1; echo "rc=$?")" = "rc=0"

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
