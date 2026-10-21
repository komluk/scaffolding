#!/usr/bin/env bash
# action-log.sh — Stop + SessionEnd hook: episodic action log for LOCAL sessions.
#
# Reads the CLI transcript (transcript_path from stdin) and appends ONE metadata-only,
# redacted JSONL line per tool call to .scaffolding/conversations/<session_id>/actions/,
# then re-renders conversations/<id>/timeline.md. Never stores tool output, file
# contents, prompts or MCP results (see hooks/lib/action_log.py). Incremental via a
# byte cursor, so only new lines are parsed. Always exits 0 and never blocks.
#
# DEFAULT OFF (opt-in): a plugin update never starts logging by itself. Enable with
# ACTION_LOG_ENABLED=1|true|yes|on in the environment, or per repo with the sentinel
# .scaffolding/.actionlog.
#
# Skips when: not opted in, SCAFFOLDING_TASK_ID set (platform run — the backend
# extracts post-run), SCAFFOLDING_ACTION_LOG=off (hard off, wins over opt-in),
# .scaffolding/.noactionlog exists, no .scaffolding/conversations/, or the lock is
# busy (next Stop catches up).
set +e

INPUT=$(cat 2>/dev/null)
[ -n "${SCAFFOLDING_TASK_ID:-}" ] && exit 0
[ "${SCAFFOLDING_ACTION_LOG:-}" = "off" ] && exit 0

DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
SC="$DIR/.scaffolding"
[ -f "$SC/.noactionlog" ] && exit 0
case "$(printf '%s' "${ACTION_LOG_ENABLED:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) ;;
    *) [ -f "$SC/.actionlog" ] || exit 0 ;;
esac
[ -d "$SC/conversations" ] || exit 0

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/action_log.py"
[ -f "$LIB" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

# transcript_path / session_id / hook event come from stdin JSON; only UUID-ish ids are accepted.
FIELDS=$(printf '%s' "$INPUT" | python3 -I -c '
import json, re, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
sid, tp = d.get("session_id"), d.get("transcript_path")
if isinstance(sid, str) and re.fullmatch(r"[A-Za-z0-9-]{8,64}", sid) and isinstance(tp, str) and tp.endswith(".jsonl"):
    print(sid); print(tp); print("1" if d.get("hook_event_name") == "SessionEnd" else "0")
' 2>/dev/null)
SID=$(printf '%s\n' "$FIELDS" | sed -n 1p)
TP=$(printf '%s\n' "$FIELDS" | sed -n 2p)
FINAL=$(printf '%s\n' "$FIELDS" | sed -n 3p)
[ -n "$SID" ] && [ -f "$TP" ] || exit 0

CONV="$SC/conversations/$SID"
mkdir -p "$CONV/actions" 2>/dev/null || exit 0

ARGS=(local --transcript "$TP" --session-id "$SID" --conv-dir "$CONV" --project-dir "$DIR")
[ "$FINAL" = "1" ] && ARGS+=(--final)

run() {
    timeout 5 python3 -I "$LIB" "${ARGS[@]}" 2>/dev/null
    timeout 5 python3 -I "$LIB" render --conv-dir "$CONV" >/dev/null 2>&1
}

if command -v flock >/dev/null 2>&1; then
    ( flock -n 9 || exit 0; run ) 9>"$CONV/actions/.lock"
else
    run
fi
exit 0
