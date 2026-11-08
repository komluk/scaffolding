#!/usr/bin/env bash
# action-log.sh — Stop + SessionEnd hook: episodic action log for LOCAL sessions.
#
# Reads the CLI transcript (transcript_path from stdin) and appends ONE metadata-only,
# redacted JSONL line per tool call to .scaffolding/conversations/<session_id>/actions/,
# then re-renders conversations/<id>/timeline.md. Never stores tool output, file
# contents, prompts or MCP results (see hooks/lib/action-log.mjs). Incremental via a
# byte cursor, so only new lines are parsed. Always exits 0 and never blocks.
#
# DEFAULT OFF (opt-in): a plugin update never starts logging by itself. Enable with
# ACTION_LOG_ENABLED=1|true|yes|on in the environment, or per repo with the sentinel
# .scaffolding/.actionlog.
#
# Skips when: not opted in, SCAFFOLDING_TASK_ID set (platform run — the backend
# extracts post-run), SCAFFOLDING_ACTION_LOG=off (hard off, wins over opt-in),
# .scaffolding/.noactionlog exists, no .scaffolding/conversations/, or the lock is
# busy (next Stop catches up). Needs node >= 22; without node it does nothing.
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

LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib/action-log.mjs"
[ -f "$LIB" ] || exit 0
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, action-log not enforced" >&2; exit 0; }

# transcript_path / session_id / hook event come from stdin JSON; only UUID-ish ids are accepted
# (the three lines are printed only for a valid session_id and a *.jsonl transcript_path).
FIELDS=$(printf '%s' "$INPUT" | node "$LIB" hook-fields 2>/dev/null)
SID=$(printf '%s\n' "$FIELDS" | sed -n 1p)
TP=$(printf '%s\n' "$FIELDS" | sed -n 2p)
FINAL=$(printf '%s\n' "$FIELDS" | sed -n 3p)
[ -n "$SID" ] && [ -f "$TP" ] || exit 0

CONV="$SC/conversations/$SID"
mkdir -p "$CONV/actions" 2>/dev/null || exit 0

ARGS=(local --transcript "$TP" --session-id "$SID" --conv-dir "$CONV" --project-dir "$DIR")
[ "$FINAL" = "1" ] && ARGS+=(--final)

run() {
    timeout 5 node "$LIB" "${ARGS[@]}" 2>/dev/null
    timeout 5 node "$LIB" render --conv-dir "$CONV" >/dev/null 2>&1
}

if command -v flock >/dev/null 2>&1; then
    ( flock -n 9 || exit 0; run ) 9>"$CONV/actions/.lock"
else
    run
fi
exit 0
