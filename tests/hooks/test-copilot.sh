#!/usr/bin/env bash
# copilot/: the node tooling that replaced the python scripts and jq (transform, settings mergers, plugin-root
# resolver, pre-commit wrapper, sync, install). Everything runs in a throwaway HOME; `copilot` is a stub.
# Byte-level parity with the python originals is in tests/hooks/parity (copilot-merge.sh goldens).
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

REPO="$(cd "$HOOKS_DIR/.." && pwd)"
CP="$REPO/copilot"
T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
export HOME="$T/home"
mkdir -p "$HOME" "$T/bin"
unset SCAFFOLDING_PLUGIN_ROOT
# a `copilot` stub that records its arguments, first on PATH
printf '#!/bin/sh\necho "$@" >> "%s/copilot.calls"\n' "$T" > "$T/bin/copilot"
chmod +x "$T/bin/copilot"
export PATH="$T/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then bad "node is required (>=22)"; finish; exit; fi

echo "# no python, no jq in the copilot tooling"
# invocations only: comments that name python behaviour the port reproduces, and install.sh removing old .py files, are fine
check "no python3 / jq invocation in copilot/" test -z "$(grep -rnE '(^|[;&|(\x60$[:space:]])(python3?|jq)[[:space:]]+[^#]' "$CP" --include='*.sh' --include='*.tmpl' | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(#|//)')"
check "no .py file left in copilot/" test -z "$(find "$CP" -name '*.py')"
check "every .mjs parses" bash -c "for f in '$CP'/*.mjs; do node --check \"\$f\" || exit 1; done"

echo "# transform"
agents="developer debugger reviewer tech-writer devops gitops"
for a in $agents; do
    node "$CP/scaffolding-transform.mjs" "$a" "$REPO/agents/$a.md" "$T/out-$a.md" 2>"$T/err"
    check "$a: name rewritten" bash -c "head -5 '$T/out-$a.md' | grep -q '^name: scaffolding:$a\$'"
    check "$a: infer added, tools/model/effort/maxTurns/disallowedTools gone" bash -c "! sed -n '1,/^---\$/p;' '$T/out-$a.md' | sed '1d' | sed '/^---\$/q' | grep -qE '^(tools|model|effort|maxTurns|disallowedTools):' && sed -n '1,/^<!--/p' '$T/out-$a.md' | grep -q '^infer: true\$'"
    check "$a: marker follows the closing ---" bash -c "sed -n '1,/^---\$/!p' '$T/out-$a.md' | head -2 | grep -qF '<!-- generated-by: scaffolding-copilot-sync | source: $REPO/agents/$a.md -->'"
    # body = everything after the source's closing ---, byte for byte
    src_body="$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' "$REPO/agents/$a.md" | md5sum)"
    out_body="$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' "$T/out-$a.md" | tail -n +2 | md5sum)"
    check "$a: body byte-identical" test "$src_body" = "$out_body"
    check "$a: nothing on stderr" test ! -s "$T/err"
done
check "description line copied verbatim" bash -c "grep -qxF \"\$(grep -m1 '^description:' '$REPO/agents/developer.md')\" '$T/out-developer.md'"
check "skills list copied verbatim" bash -c "diff <(awk '/^skills:/{f=1;print;next} f&&/^  - /{print;next} f{exit}' '$REPO/agents/developer.md') <(awk '/^skills:/{f=1;print;next} f&&/^  - /{print;next} f{exit}' '$T/out-developer.md')"

mkdir -p "$T/tr"
printf -- '---\nname: other\ndescription: "quoted: with colon"\nunknown: x\ntools: A, B\nskills:\n  - s1\n  - s2\nmodel: m\ndisallowedTools:\n  - Write\n---\nBODY\nline2\n' > "$T/tr/mismatch.md"
node "$CP/scaffolding-transform.mjs" want "$T/tr/mismatch.md" "$T/tr/out.md" 2>"$T/err"; rc=$?
check "name mismatch: exit 0 and a warning" bash -c "test $rc = 0 && grep -q \"WARNING: source frontmatter name='other' does not match expected agent 'want'\" '$T/err'"
check "name mismatch: output" bash -c "printf -- '---\nname: scaffolding:want\ndescription: \"quoted: with colon\"\nskills:\n  - s1\n  - s2\ninfer: true\n---\n<!-- generated-by: scaffolding-copilot-sync | source: $T/tr/mismatch.md -->\nBODY\nline2\n' | cmp -s - '$T/tr/out.md'"
printf 'no frontmatter\n' > "$T/tr/none.md"
node "$CP/scaffolding-transform.mjs" a "$T/tr/none.md" "$T/tr/o2.md" 2>"$T/err"; rc=$?
check "no frontmatter: exit 1, nothing written" bash -c "test $rc = 1 && test ! -e '$T/tr/o2.md' && grep -q 'does not start with a YAML frontmatter' '$T/err'"
printf -- '---\nname: a\nbody never closed\n' > "$T/tr/open.md"
node "$CP/scaffolding-transform.mjs" a "$T/tr/open.md" "$T/tr/o3.md" 2>"$T/err"; rc=$?
check "unterminated frontmatter: exit 1" bash -c "test $rc = 1 && test ! -e '$T/tr/o3.md'"
node "$CP/scaffolding-transform.mjs" a 2>"$T/err"; rc=$?
check "usage error: exit 1" bash -c "test $rc = 1 && grep -q '^usage: scaffolding-transform.mjs' '$T/err'"
check "no .tmp left behind" test -z "$(find "$T/tr" "$T" -maxdepth 1 -name '*.tmp')"

echo "# plugin root resolver"
CACHE="$HOME/.claude/plugins/cache/komluk-scaffolding/scaffolding"
mkdir -p "$CACHE/2.9.0/agents" "$CACHE/2.10.0/agents" "$CACHE/2.1.0/agents" "$HOME/.claude/plugins"
touch "$CACHE/2.9.0/agents/developer.md" "$CACHE/2.10.0/agents/developer.md" "$CACHE/2.1.0/agents/developer.md"
printf '{"plugins":{"scaffolding@komluk-scaffolding":[{"installPath":"%s/2.1.0"}]}}\n' "$CACHE" > "$HOME/.claude/plugins/installed_plugins.json"
check "manifest installPath wins" test "$(bash "$CP/scaffolding-plugin-root.sh")" = "$CACHE/2.1.0"
check "env override wins over the manifest" test "$(SCAFFOLDING_PLUGIN_ROOT="$CACHE/2.9.0" bash "$CP/scaffolding-plugin-root.sh")" = "$CACHE/2.9.0"
printf '{broken' > "$HOME/.claude/plugins/installed_plugins.json"
check "broken manifest: falls back to the highest version (sort -V)" test "$(bash "$CP/scaffolding-plugin-root.sh" 2>/dev/null)" = "$CACHE/2.10.0"
check "broken manifest: warns on stderr" contains "$(bash "$CP/scaffolding-plugin-root.sh" 2>&1 >/dev/null)" "falling back to highest version"
printf '{"plugins":{}}\n' > "$HOME/.claude/plugins/installed_plugins.json"
check "manifest without the plugin: falls back" test "$(bash "$CP/scaffolding-plugin-root.sh" 2>/dev/null)" = "$CACHE/2.10.0"
printf '{"plugins":{"scaffolding@komluk-scaffolding":[{"installPath":"/nonexistent"}]}}\n' > "$HOME/.claude/plugins/installed_plugins.json"
check "manifest points nowhere: falls back" test "$(bash "$CP/scaffolding-plugin-root.sh" 2>/dev/null)" = "$CACHE/2.10.0"
rm -rf "$HOME/.claude"
check "nothing to resolve: exit 1" bash -c "! bash '$CP/scaffolding-plugin-root.sh' 2>/dev/null"

echo "# sync (SCAFFOLDING_PLUGIN_ROOT = this checkout)"
export SCAFFOLDING_PLUGIN_ROOT="$REPO"
# the scripts are copied to ~/.copilot like install.sh does
mkdir -p "$HOME/.copilot/hooks"
cp "$CP"/scaffolding-* "$HOME/.copilot/"
cp "$CP/hooks/pre-commit-validation-copilot.sh.tmpl" "$HOME/.copilot/hooks/"
S="$HOME/.copilot/scaffolding-sync.sh"
out="$(bash "$S" --dry-run 2>&1)"; rc=$?
check "dry-run: exit 0" test "$rc" = 0
check "dry-run: plans 6 agents" test "$(printf '%s\n' "$out" | grep -c 'would write: .*scaffolding-.*\.md')" = 6
check "dry-run: writes nothing" test ! -e "$HOME/.copilot/agents"
out="$(bash "$S" 2>&1)"; rc=$?
check "sync: exit 0" test "$rc" = 0
check "sync: 6 agents written" test "$(find "$HOME/.copilot/agents" -name 'scaffolding-*.md' | wc -l)" = 6
check "sync: summary line" contains "$out" "synced 6 agents"
check "sync: wrapper rendered and executable" test -x "$HOME/.copilot/hooks/pre-commit-validation-copilot.sh"
check "sync: wrapper has the plugin root baked in" contains "$(cat "$HOME/.copilot/hooks/pre-commit-validation-copilot.sh")" "FAST_PATH_ROOT=\"$REPO\""
W="$HOME/.copilot/hooks/pre-commit-validation-copilot.sh"
for r in "$HOME/repos/.claude/settings.json" "$HOME/repos/homelab/.claude/settings.json" "$HOME/repos/aiproxy/.claude/settings.json"; do
    check "sync: hook registered in ${r#"$HOME"/}" bash -c "node -e 'const s=JSON.parse(require(\"fs\").readFileSync(process.argv[1]));const e=s.hooks.PreToolUse.find(x=>x.matcher===\"Bash\");process.exit(e.hooks.some(h=>h.command===process.argv[2]&&h.timeout===120)?0:1)' '$r' '$W'"
done
check "sync: skills registration called the copilot CLI" contains "$(cat "$T/copilot.calls" 2>/dev/null)" "skill add $REPO/skills"
before="$(md5sum "$HOME/repos/.claude/settings.json")"
bash "$S" >/dev/null 2>&1
check "sync twice: settings.json unchanged (idempotent)" test "$(md5sum "$HOME/repos/.claude/settings.json")" = "$before"
check "sync: stale generated agent pruned, user agent kept" bash -c "
  printf '<!-- generated-by: scaffolding-copilot-sync -->\n' > '$HOME/.copilot/agents/scaffolding-old.md'; printf 'mine\n' > '$HOME/.copilot/agents/mine.md'
  bash '$S' >/dev/null 2>&1; test ! -e '$HOME/.copilot/agents/scaffolding-old.md' && test -e '$HOME/.copilot/agents/mine.md'"
# an existing settings.json keeps its other content
printf '{"model":"x","hooks":{"PreCompact":[{"hooks":[]}]}}\n' > "$HOME/repos/.claude/settings.json"
bash "$S" >/dev/null 2>&1
check "sync: existing keys survive the merge" bash -c "node -e 'const s=JSON.parse(require(\"fs\").readFileSync(process.argv[1]));process.exit(s.model===\"x\"&&s.hooks.PreCompact.length===1&&s.hooks.PreToolUse.length===1?0:1)' '$HOME/repos/.claude/settings.json'"
check "sync without node: clear error, exit 1" bash -c "PATH=\"\$(dirname \$(command -v bash)):/nonexistent\" env -i HOME='$HOME' PATH=\"\$(dirname \$(command -v bash))\" bash '$S' --dry-run 2>&1 | grep -q 'node (>= 22) is required'"

echo "# uninstall"
mkdir -p "$HOME/.copilot"
printf '{"skillDirectories":["%s/.claude/plugins/cache/komluk-scaffolding/scaffolding/2.1.0/skills","/mine"],"keep":1}\n' "$HOME" > "$HOME/.copilot/settings.json"
bash "$S" --uninstall >/dev/null 2>&1; rc=$?
check "uninstall: exit 0" test "$rc" = 0
check "uninstall: generated agents removed, user agent kept" bash -c "test -e '$HOME/.copilot/agents/mine.md' && test -z \"\$(ls '$HOME/.copilot/agents' | grep scaffolding-)\""
check "uninstall: wrapper removed" test ! -e "$W"
check "uninstall: PreToolUse entry removed, other keys kept" bash -c "node -e 'const s=JSON.parse(require(\"fs\").readFileSync(process.argv[1]));process.exit(s.model===\"x\"&&s.hooks.PreCompact.length===1&&!(\"PreToolUse\" in s.hooks)?0:1)' '$HOME/repos/.claude/settings.json'"
check "uninstall: cache skill dir removed, user dir kept" bash -c "node -e 'const s=JSON.parse(require(\"fs\").readFileSync(process.argv[1]));process.exit(JSON.stringify(s.skillDirectories)===JSON.stringify([\"/mine\"])&&s.keep===1?0:1)' '$HOME/.copilot/settings.json'"

echo "# install.sh retires the python tooling"
rm -rf "$HOME/.copilot"; mkdir -p "$HOME/.copilot"
for f in scaffolding-hook-merge.py scaffolding-skills-merge.py scaffolding-transform.py; do echo old > "$HOME/.copilot/$f"; done
echo mine > "$HOME/.copilot/scaffolding-notes.txt"
bash "$CP/install.sh" >/dev/null 2>&1; rc=$?
check "install: exit 0" test "$rc" = 0
check "install: old .py removed" test -z "$(find "$HOME/.copilot" -name '*.py')"
check "install: .mjs copied and executable" bash -c "for f in hook-merge skills-merge transform json; do test -f \"$HOME/.copilot/scaffolding-\$f.mjs\" || exit 1; done; test -x \"$HOME/.copilot/scaffolding-transform.mjs\""
check "install: template copied" test -f "$HOME/.copilot/hooks/pre-commit-validation-copilot.sh.tmpl"
check "install: ran the sync (6 agents)" test "$(find "$HOME/.copilot/agents" -name 'scaffolding-*.md' | wc -l)" = 6

echo "# pre-commit wrapper (no jq on PATH)"
W="$HOME/.copilot/hooks/pre-commit-validation-copilot.sh"
FAKE="$T/plugin"; mkdir -p "$FAKE/hooks" "$FAKE/agents" "$T/proj"; touch "$FAKE/agents/developer.md"
cat > "$FAKE/hooks/pre-commit-validation.sh" <<'VAL'
#!/usr/bin/env bash
echo "validator cwd=$PWD"
exit "${VRC:-0}"
VAL
sed "s#__SCAFFOLDING_PLUGIN_ROOT_FASTPATH__#$FAKE#" "$CP/hooks/pre-commit-validation-copilot.sh.tmpl" > "$T/wrap.sh"
# PATH without jq: symlinks to what the wrapper needs
mkdir -p "$T/nojq"; for t in bash sh cat grep sed head tail tr printf echo env dirname basename node; do p="$(command -v "$t")"; [ -n "$p" ] && ln -sf "$p" "$T/nojq/$t"; done
wrap() { printf '%s' "$1" | env -i PATH="$T/nojq" HOME="$T/empty-home" VRC="${2:-0}" "$T/nojq/bash" "$T/wrap.sh" 2>"$T/werr"; }
mkdir -p "$T/empty-home"
out="$(wrap "{\"toolName\":\"Bash\",\"toolInput\":{\"command\":\"git -C $T/proj commit -m x\"}}")"; rc=$?
check "git commit runs the validator in the -C dir" bash -c "test $rc = 0 && printf '%s' '$out' | grep -qF 'validator cwd=$T/proj'"
out="$(wrap "{\"toolName\":\"Bash\",\"toolInput\":{\"command\":\"git commit\"},\"cwd\":\"$T/proj\"}" 1)"; rc=$?
check "validator exit 1 blocks with exit 2 and a JSON decision" bash -c "test $rc = 2 && printf '%s' '$out' | grep -qF '\"permissionDecision\":\"block\",\"permissionDecisionReason\":\"validation failed (exit 1)\"'"
wrap '{"toolName":"Bash","toolInput":{"command":"git log --grep commit"}}' >/dev/null; check "not a commit: allowed" test "$?" = 0
wrap '{"toolName":"Edit","toolInput":{"command":"git commit"}}' >/dev/null; check "not a shell tool: allowed" test "$?" = 0
wrap 'not json' >/dev/null; rc=$?
check "unparseable payload: fail open with a warning" bash -c "test $rc = 0 && grep -q 'unparseable JSON payload' '$T/werr'"
wrap '' >/dev/null; rc=$?
check "empty payload: fail open" bash -c "test $rc = 0 && grep -q 'empty stdin payload' '$T/werr'"
out="$(wrap '{"toolName":"Bash","toolInput":{"command":"echo a\\nb && git commit"},"cwd":"'"$T"'/proj"}')"
check "multi-line command is scanned" contains "$out" "validator cwd=$T/proj"
env -i PATH="/nonexistent" /bin/bash "$T/wrap.sh" </dev/null >/dev/null 2>"$T/werr"; rc=$?
check "no node: fail open with a warning" bash -c "test $rc = 0 && grep -q 'node not found' '$T/werr'"

echo "# scaffolding-json.mjs = hooks/lib/hook-io.mjs (the copy installed without hooks/lib)"
cat > "$T/same.mjs" <<JS
import { parse, dumps } from '$CP/scaffolding-json.mjs';
import { parseJson, pyDumps } from '$HOOKS_DIR/lib/hook-io.mjs';
const samples = ['{"a":1,"b":1.0,"c":[1,2.5e-7,{"d":null}],"e":"zażółć 😀 \\\\u0001","f":12345678901234567890,"2":1,"1":2}', '[]', '{}', '[[],{}]', '"x"', '{"n":NaN,"i":Infinity}', '{"k":-0.0,"m":1e22,"p":1e16,"q":123456789.125}'];
let bad = 0;
for (const s of samples) {
  const a = dumps(parse(s));
  const b = pyDumps(parseJson(s), { indent: 2 });
  if (a !== b) { bad++; console.log('DIFF', s, a, b); }
}
process.exit(bad ? 1 : 0);
JS
check "parse/dumps agree with hook-io on $((7)) samples" node "$T/same.mjs"

finish
