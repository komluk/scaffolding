#!/usr/bin/env bash
# Episodic action log: metadata-only capture, redaction leak test (0/10), caps, hook gating.
set +e
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HOOKS_DIR/lib/action_log.py"
HOOK="$HOOKS_DIR/action-log.sh"
AL() { python3 -I "$LIB" "$@"; }

T=$(mktmp); trap 'rm -rf "$T"' EXIT
python3 -I "$HERE/action_log_fixtures.py" "$T/fx" || { echo "fixture generation failed"; exit 1; }
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
BAD=$(python3 -I - "$A" <<'PY'
import json, sys
ok = {"v","ts","src","conv","run","repo","agent","parent","seq","id","tool","kind","target","status","end","calls","errors","truncated"}
print(sum(1 for l in open(sys.argv[1]) for k in json.loads(l) if k not in ok))
PY
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
python3 -I - "$CAP/tasks/r/output.jsonl" <<'PY'
import json, sys
with open(sys.argv[1], "w") as fh:
    for i in range(5200):
        fh.write(json.dumps({"type":"step","data":{"type":"tool_call","data":{"tool":"Read","input":{"file_path":"/f/%d"%i},"id":"r%d"%i}},"ts":1792489380.0})+"\n")
    fh.write(json.dumps({"type":"step","data":{"type":"tool_call","data":{"tool":"Bash","input":{"command":"echo keep"},"id":"b1"}},"ts":1792489381.0})+"\n")
PY
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
t0=$(date +%s.%N)
printf '{"session_id":"%s","transcript_path":"%s/cc/big.jsonl","hook_event_name":"Stop"}' "$SID" "$T" | ACTION_LOG_ENABLED=1 CLAUDE_PROJECT_DIR="$BR" bash "$HOOK"
el=$(python3 -c "print($(date +%s.%N)-$t0)")
check "big transcript < 5s (${el}s)" python3 -c "import sys; sys.exit(0 if $el < 5 else 1)"

echo "-- redact(): format-detectable secrets masked in every context"
# Secrets 3 (url password), 8 (heredoc body) and 9 (Task prompt) have no detectable format: they are
# excluded STRUCTURALLY (userinfo rule / heredoc cut / prompt never read) and covered by the leak tests above.
RD=$(python3 -I - "$HOOKS_DIR/lib" "$T/fx/secrets.txt" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from action_log_lib.redact import redact
sec = [s for s in open(sys.argv[2]).read().split("\n") if s]
bad = 0
for i, s in enumerate(sec, 1):
    if i in (3, 8, 9):
        continue
    for ctx in ("%s", "run --x %s tail", "k=%s", "Authorization: Bearer %s", "https://u:%s@h/p"):
        if s in redact(ctx % s):
            bad += 1
            sys.stderr.write("    UNMASKED(%r): %s...\n" % (ctx, s[:8]))
if "Zq9PlantedPw77" in redact("https://admin:Zq9PlantedPw77@h/p"):
    bad += 1
print(bad)
PY
)
check "redact() masks every format-detectable secret in every context (unmasked: $RD)" [ "$RD" = 0 ]
check "redact() keeps git sha, uuid and long paths" python3 -I -c "
import sys; sys.path.insert(0,'$HOOKS_DIR/lib')
from action_log_lib.redact import redact
for t in ('a'*40, '11111111-2222-3333-4444-555555555555', 'ansible/playbooks/files/memory/ingest/pipeline_helpers_module.py'):
    assert redact(t) == t, t
"

echo "-- sync script: no internal literals in vendored patterns"
check "no INTERNAL_DOMAIN/PRIVATE_IP/hostname in secret-patterns.json" bash -c "! grep -qiE 'INTERNAL_DOMAIN|PRIVATE_IP|rfc1918|\.waw\.pl' '$HOOKS_DIR/lib/secret-patterns.json'"

finish
