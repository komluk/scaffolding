#!/usr/bin/env bash
# memory-ingest-mark.sh — SubagentStop hook: cheap dirty-mark. NO LLM, sub-50ms.
#
# When a subagent finishes and new conversation knowledge exists (a context.md
# newer than the last ingest), mark the session dirty and drop a breadcrumb so
# the Stop hook (memory-ingest.sh) can enforce a single ingest at end of turn.
#
# Pure bash file checks — no network, no LLM, no MCP. Always exits 0.
#
# Opt-out: SCAFFOLDING_MEMORY_INGEST=off, or a .scaffolding/.noingest sentinel.

set +e

INPUT=$(cat 2>/dev/null)
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
SC="$DIR/.scaffolding"

# opt-out gates
[ "${SCAFFOLDING_MEMORY_INGEST:-}" = "off" ] && exit 0
[ -f "$SC/.noingest" ] && exit 0
[ -d "$SC/conversations" ] || exit 0

# Already marked dirty this turn — no-op. Prevents unbounded breadcrumb growth
# in advisory mode (default), where the agent may never run the ingest that
# would clear .ingest-dirty / refresh .ingest-seen. One breadcrumb per dirty
# window is enough for the Stop hook.
[ -f "$SC/.ingest-dirty" ] && exit 0

# throttle: any context.md newer than the last ingest? If .ingest-seen is
# missing, treat as "new knowledge exists" and fall through to the mark.
SEEN="$SC/.ingest-seen"
if [ -f "$SEEN" ]; then
    newest=$(find "$SC/conversations" -name context.md -newer "$SEEN" 2>/dev/null | head -1)
    [ -z "$newest" ] && exit 0
fi

# mark dirty + breadcrumb (topic = the finishing subagent's type, best-effort)
touch "$SC/.ingest-dirty" 2>/dev/null || exit 0

topic="task"
if command -v python3 >/dev/null 2>&1; then
    t=$(printf '%s' "$INPUT" | python3 -c \
        'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("subagent_type") or "task")
except Exception:
    print("task")' 2>/dev/null)
    [ -n "$t" ] && topic="$t"
fi

printf '{"ts":"%s","topic":"%s","kind":"breadcrumb"}\n' \
    "$(date -u +%FT%TZ)" "$topic" >> "$SC/.ingest-queue" 2>/dev/null

exit 0
