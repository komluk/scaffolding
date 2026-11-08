#!/usr/bin/env bash
# Episodic action log: metadata-only capture, redaction leak test (0/10), caps, hook gating.
set +e
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HOOKS_DIR/lib/action-log.mjs"
HOOK="$HOOKS_DIR/action-log.sh"
AL() { node "$LIB" "$@"; }

command -v node >/dev/null 2>&1 || { bad "node is required (>=22) for the action log"; finish; exit; }
T=$(mktmp); trap 'rm -rf "$T"' EXIT
node "$HERE/action-log-fixtures.mjs" "$T/fx" || { echo "fixture generation failed"; exit 1; }
SID=11111111-2222-3333-4444-555555555555
CONV=22222222-3333-4444-5555-666666666666

leaks() { # dir -> number of planted secrets found anywhere under dir (incl. gz)
    local n=0 s
    while IFS= read -r s; do
        [ -n "$s" ] || continue
        if grep -rqF -- "$s" "$1" 2>/dev/null; then n=$((n + 1)); echo "    LEAK: ${s:0:8}…" >&2; fi
        for g in $(find "$1" -name '*.gz' 2>/dev/null); do zcat "$g" | grep -qF -- "$s" && n=$((n + 1)); done
    done < "$T/fx/secrets.txt"
    echo "$n"
}

echo "-- platform: leak test"
P="$T/share/projects/proj/conversations/$CONV"; mkdir -p "$P/tasks"
cp -r "$T/fx/platform" "$P/tasks/run-aaaa"
AL platform --task-dir "$P/tasks/run-aaaa" --conv-dir "$P"; check "platform exit 0" [ $? -eq 0 ]
AL render --conv-dir "$P" >/dev/null
A="$P/actions/run-aaaa.jsonl"
check "actions jsonl written" has_file "$A"
check "timeline.md written" has_file "$P/timeline.md"
L=$(leaks "$P/actions"); check "0/10 secrets in actions/ (found $L)" [ "$L" = 0 ]
L=$(leaks "$P/timeline.md"); check "0/10 secrets in timeline.md (found $L)" [ "$L" = 0 ]
N=$(grep -c '"tool":' "$A"); check "records == tool_call frames (12), got $N" [ "$N" = 12 ]
check "footer present" grep -q '"end":true' "$A"
check "bash env + bearer + userinfo stripped" grep -q 'VAULT_TOKEN=\*\*\* curl' "$A"
check "heredoc dropped" grep -q '"target":"cat > .env"' "$A"
check "Task prompt absent, type kept" grep -q '"target":"developer: implement x"' "$A"
check "mcp token/body/title args dropped" bash -c "grep 'create_issue' '$A' | grep -q 'owner=komluk repo=homelab\"'"
check "webfetch query stripped" grep -q '"target":"https://example.com/p/q"' "$A"
check "subagent edit carries agent+parent" bash -c "grep '/work/proj/b.py\|b.py' '$A' | grep -q '\"agent\":\"developer\".*\"parent\":\"t7\"'"
check "status error from success=false" bash -c "grep 'tofu apply' '$A' | grep -q '\"status\":\"error\"'"
check "repeated failure in timeline" grep -q 'tofu apply.*×2' "$P/timeline.md"
# metadata-only: only the schema keys exist
BAD=$(node - "$A" <<'JS'
const ok = new Set(["v","ts","src","conv","run","repo","agent","parent","seq","id","tool","kind","target","status","end","calls","errors","truncated"]);
const lines = require("node:fs").readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
console.log(lines.reduce((n, l) => n + Object.keys(JSON.parse(l)).filter((k) => !ok.has(k)).length, 0));
JS
)
check "no non-schema (raw) fields" [ "$BAD" = 0 ]
check "timeline <= 200 lines" [ "$(wc -l < "$P/timeline.md")" -le 200 ]

echo "-- platform: no tool_result frames -> status unknown, N == calls"
Q="$T/share/projects/proj/conversations/$CONV-b"; mkdir -p "$Q/tasks"; cp -r "$T/fx/platform-noresult" "$Q/tasks/run-bbbb"
AL platform --task-dir "$Q/tasks/run-bbbb" --conv-dir "$Q"
check "all unknown" bash -c "! grep '\"tool\":' '$Q/actions/run-bbbb.jsonl' | grep -qv '\"status\":\"unknown\"'"

echo "-- fail-open"
AL platform --task-dir /nonexistent --conv-dir /nonexistent; check "missing dir exits 0" [ $? -eq 0 ]
AL render --conv-dir /nonexistent; check "render missing dir exits 0" [ $? -eq 0 ]
AL bogus-subcommand 2>/dev/null; check "bad usage exits 0" [ $? -eq 0 ]
M="$T/share/projects/proj/conversations/$CONV-c"; mkdir -p "$M/tasks/r"; printf '{broken\n\x00\x01\n' > "$M/tasks/r/output.jsonl"
AL platform --task-dir "$M/tasks/r" --conv-dir "$M"; check "malformed stream exits 0" [ $? -eq 0 ]
check "malformed: no tool records" bash -c "! grep -q '\"tool\":' '$M/actions/r.jsonl' 2>/dev/null"

echo "-- caps"
CAP="$T/share/projects/proj/conversations/$CONV-d"; mkdir -p "$CAP/tasks/r"
node - "$CAP/tasks/r/output.jsonl" <<'JS'
const out = [];
const frame = (tool, input, id, ts) => JSON.stringify({ type: "step", data: { type: "tool_call", data: { tool, input, id } }, ts }) + "\n";
for (let i = 0; i < 5200; i++) out.push(frame("Read", { file_path: "/f/" + i }, "r" + i, 1792489380.0));
out.push(frame("Bash", { command: "echo keep" }, "b1", 1792489381.0));
require("node:fs").writeFileSync(process.argv[2], out.join(""));
JS
AL platform --task-dir "$CAP/tasks/r" --conv-dir "$CAP"
C=$(grep -c '"tool":' "$CAP/actions/r.jsonl")
check "over 5000: reads dropped, exec kept ($C records)" bash -c "[ $C -le 5001 ] && grep -q 'echo keep' '$CAP/actions/r.jsonl' && grep -q '\"truncated\":2' '$CAP/actions/r.jsonl'"

echo "-- local: incremental cursor + subagent"
R="$T/repo"; mkdir -p "$R/.scaffolding/conversations" "$T/cc"; cp -r "$T/fx/local/$SID" "$T/cc/"; cp "$T/fx/local/$SID.jsonl" "$T/cc/$SID.jsonl"
hook() { printf '{"session_id":"%s","transcript_path":"%s/cc/%s.jsonl","hook_event_name":"%s"}' "$SID" "$T" "$SID" "$1" | ACTION_LOG_ENABLED=1 CLAUDE_PROJECT_DIR="$R" bash "$HOOK"; }
hook Stop; check "hook exits 0" [ $? -eq 0 ]
LA="$R/.scaffolding/conversations/$SID/actions/$SID.jsonl"
N1=$(grep -c '"tool":' "$LA"); hook Stop; N2=$(grep -c '"tool":' "$LA")
check "second Stop adds no duplicates ($N1 -> $N2)" [ "$N1" = "$N2" ]
cat "$T/fx/local/more.jsonl" >> "$T/cc/$SID.jsonl"; hook Stop; N3=$(grep -c '"tool":' "$LA")
check "growing transcript appends only new calls ($N2 -> $N3)" [ "$N3" -gt "$N2" ]
check "no duplicate ids" [ "$(grep -o '"id":"[^"]*"' "$LA" | sort | uniq -d | wc -l)" = 0 ]
check "local subagent carries agent=debugger parent=t7" bash -c "grep 'sub.py' '$LA' | grep -q '\"agent\":\"debugger\".*\"parent\":\"t7\"'"
check "local status from is_error" bash -c "grep 'tofu apply' '$LA' | grep -q '\"status\":\"error\"'"
hook SessionEnd; check "SessionEnd writes footer" grep -q '"end":true' "$LA"
check "local timeline rendered" has_file "$R/.scaffolding/conversations/$SID/timeline.md"
L=$(leaks "$R/.scaffolding/conversations"); check "0/10 secrets in local output (found $L)" [ "$L" = 0 ]

echo "-- hook gating"
for mode in task off sentinel noconv; do
    G="$T/gate-$mode"; mkdir -p "$G/.scaffolding/conversations"
    case $mode in noconv) rm -rf "$G/.scaffolding/conversations";; sentinel) touch "$G/.scaffolding/.noactionlog";; esac
    printf '{"session_id":"%s","transcript_path":"%s/cc/%s.jsonl","hook_event_name":"Stop"}' "$SID" "$T" "$SID" |
        env ACTION_LOG_ENABLED=1 CLAUDE_PROJECT_DIR="$G" $( [ $mode = task ] && echo SCAFFOLDING_TASK_ID=x ) $( [ $mode = off ] && echo SCAFFOLDING_ACTION_LOG=off ) bash "$HOOK"
    check "gate $mode: exit 0, nothing written" bash -c "[ \$? -eq 0 ] && [ -z \"\$(find '$G' -name '*.jsonl' 2>/dev/null)\" ]"
done
# default OFF: no env, no sentinel -> nothing is written (the plugin-update safety gate)
DR="$T/default-off"; mkdir -p "$DR/.scaffolding/conversations"
stop_in() { printf '{"session_id":"%s","transcript_path":"%s/cc/%s.jsonl","hook_event_name":"Stop"}' "$SID" "$T" "$SID"; }
stop_in | env -u ACTION_LOG_ENABLED -u SCAFFOLDING_ACTION_LOG -u SCAFFOLDING_TASK_ID CLAUDE_PROJECT_DIR="$DR" bash "$HOOK"
check "default (no opt-in): exit 0, nothing written" bash -c "[ -z \"\$(find '$DR/.scaffolding/conversations' -type f 2>/dev/null)\" ]"
for v in 0 false no off ""; do
    stop_in | env ACTION_LOG_ENABLED="$v" CLAUDE_PROJECT_DIR="$DR" bash "$HOOK"
done
check "ACTION_LOG_ENABLED=0/false/no/off/empty: nothing written" bash -c "[ -z \"\$(find '$DR/.scaffolding/conversations' -type f 2>/dev/null)\" ]"
touch "$DR/.scaffolding/.actionlog"
stop_in | env -u ACTION_LOG_ENABLED CLAUDE_PROJECT_DIR="$DR" bash "$HOOK"
check ".scaffolding/.actionlog sentinel opts in" has_file "$DR/.scaffolding/conversations/$SID/actions/$SID.jsonl"
rm -rf "$DR/.scaffolding/conversations/$SID"
stop_in | env ACTION_LOG_ENABLED=true SCAFFOLDING_ACTION_LOG=off CLAUDE_PROJECT_DIR="$DR" bash "$HOOK"
check "SCAFFOLDING_ACTION_LOG=off beats opt-in" bash -c "[ ! -e '$DR/.scaffolding/conversations/$SID' ]"
stop_in | env ACTION_LOG_ENABLED=TRUE SCAFFOLDING_TASK_ID=x CLAUDE_PROJECT_DIR="$DR" bash "$HOOK"
check "SCAFFOLDING_TASK_ID beats opt-in" bash -c "[ ! -e '$DR/.scaffolding/conversations/$SID' ]"
printf 'garbage' | ACTION_LOG_ENABLED=1 CLAUDE_PROJECT_DIR="$R" bash "$HOOK"; check "bad stdin exits 0" [ $? -eq 0 ]

echo "-- perf: Stop on ~45 MB transcript"
BR="$T/bigrepo"; mkdir -p "$BR/.scaffolding/conversations"; cp "$T/fx/local/big.jsonl" "$T/cc/big.jsonl"
t0=$(date +%s%N)
printf '{"session_id":"%s","transcript_path":"%s/cc/big.jsonl","hook_event_name":"Stop"}' "$SID" "$T" | ACTION_LOG_ENABLED=1 CLAUDE_PROJECT_DIR="$BR" bash "$HOOK"
el_ms=$(( ($(date +%s%N) - t0) / 1000000 ))
check "big transcript < 5s (${el_ms} ms)" test "$el_ms" -lt 5000

echo "-- redact(): format-detectable secrets masked in every context"
# Secrets 3 (url password), 8 (heredoc body) and 9 (Task prompt) have no detectable format: they are
# excluded STRUCTURALLY (userinfo rule / heredoc cut / prompt never read) and covered by the leak tests above.
cat > "$T/redact-check.mjs" <<'JS'
import fs from 'node:fs';
const { redact } = await import(process.argv[2]);
const sec = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(Boolean);
let bad = 0;
sec.forEach((s, k) => {
  if ([3, 8, 9].includes(k + 1)) return;
  for (const ctx of ['%s', 'run --x %s tail', 'k=%s', 'Authorization: Bearer %s', 'https://u:%s@h/p']) {
    if (redact(ctx.replace('%s', s)).includes(s)) {
      bad++;
      console.error(`    UNMASKED(${JSON.stringify(ctx)}): ${s.slice(0, 8)}...`);
    }
  }
});
if (redact('https://admin:' + 'Zq9PlantedPw77' + '@h/p').includes('Zq9PlantedPw77')) bad++;
console.log(bad);
JS
RD=$(node "$T/redact-check.mjs" "$HOOKS_DIR/lib/action-log/redact.mjs" "$T/fx/secrets.txt")
check "redact() masks every format-detectable secret in every context (unmasked: $RD)" [ "$RD" = 0 ]
check "redact() keeps git sha, uuid and long paths" node --input-type=module -e "
const { redact } = await import('$HOOKS_DIR/lib/action-log/redact.mjs');
for (const t of ['a'.repeat(40), '11111111-2222-3333-<CREDIT_CARD>', 'ansible/playbooks/files/memory/ingest/pipeline_helpers_module.py']) if (redact(t) !== t) throw new Error(t);
"
check "all vendored secret patterns compile in JS (a silently skipped pattern would silently stop redacting)" node --input-type=module -e "
const m = await import('$HOOKS_DIR/lib/action-log/redact.mjs');
const bad = m.brokenVendoredPatterns();
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
"

echo "-- sync script: no internal literals in vendored patterns"
check "no INTERNAL_DOMAIN/PRIVATE_IP/hostname in secret-patterns.json" bash -c "! grep -qiE 'INTERNAL_DOMAIN|PRIVATE_IP|rfc1918|\.waw\.pl' '$HOOKS_DIR/lib/secret-patterns.json'"

finish
