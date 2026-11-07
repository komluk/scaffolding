#!/usr/bin/env bash
# memory-ingest.sh — Stop hook: enforce memory ingest exactly once per turn when
# the session is dirty. The hook itself performs NO ingest — it delegates the
# work to the agent via `reason` (steps 2-5 use the agent's MCP + Write tools).
# Always exits 0.
#
# Loop prevention: reads `stop_hook_active` from the Stop event stdin JSON. When
# true (a prior hook pass already re-triggered the stop), exits 0 immediately —
# identical pattern to completion-nudge.sh, so a block fires at most once/turn.
#
# Modes (tri-state env SCAFFOLDING_MEMORY_INGEST):
#   unset  -> advisory (default): ingest directive to stderr, never blocks
#   block  -> enforce: emit {"decision":"block","reason":...} once, exit 0
#   off    -> hard disabled, no-op
# Sentinel .scaffolding/.noingest disables per-repo.

set +e

INPUT=$(cat 2>/dev/null)
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
SC="$DIR/.scaffolding"

# opt-out + no work -> no-op (cheap file checks first: node only starts when there is work to do)
[ "${SCAFFOLDING_MEMORY_INGEST:-}" = "off" ] && exit 0
[ -f "$SC/.noingest" ] && exit 0
[ -f "$SC/.ingest-dirty" ] || exit 0

LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, memory-ingest skipped" >&2; exit 0; }

PID=$(cat "$SC/project-id" 2>/dev/null)

# Step 2 depends on whether project_id resolved. If it did NOT, auto-store would
# fall back to the shared "default" namespace and leak memory across repos, so
# queue those candidates for manual /learn instead of auto-storing.
if [ -n "$PID" ]; then
    STORE_STEP="2. Dla kandydatów confidence>=0.8 (BEZ sekretów, patrz krok 3): najpierw
   semantic_search(project_id=\"$PID\") (dedup), potem
   semantic_store(project_id=\"$PID\", agent_name, tags) — CICHO."
else
    STORE_STEP="2. project_id NIEROZWIĄZANY (brak $SC/project-id) — NIE auto-store do namespace
   \"default\" (cross-project leak). Wszystkich kandydatów >=0.8 dopisz zamiast tego
   do $SC/.ingest-queue do ręcznego /learn."
fi

REASON="INGEST PAMIĘCI (wykonaj INLINE, bez Task/subagentów; potem możesz zakończyć):
1. Uruchom 'distill' (Conversation-Scoped) na aktywnej konwersacji (wejścia: context.md,
   design.md oraz $SC/conversations/<id>/timeline.md, jeśli istnieje).
$STORE_STEP
3. Kandydatów <0.8 dopisz do $SC/.ingest-queue (do /learn), NIE edytuj MEMORY.md.
   BEZPIECZEŃSTWO: NIE auto-store kandydatów zawierających sekrety/tokeny/klucze/
   hasła (cold vector store jest współdzielony i BEZ presidio) — takie ZAWSZE tnij
   do $SC/.ingest-queue do ręcznego /learn (propose-then-confirm).
4. Dopisz sekcję do $SC/agent-memory/log.md: \"## [$(date +%F)] ingest | <temat>\"
   (jeśli jest timeline.md, dodaj: \"| timeline: conversations/<id>/timeline.md (N calls, E errors)\").
5. Zapisz md5 zassanych do $SC/.ingest-seen; usuń $SC/.ingest-dirty.
6. Jeśli timeline.md istnieje i masz narzędzie trigger_ingest: wywołaj
   trigger_ingest(corpus=\"projects\", relative_path=\"<repo>/conversations/<id>/timeline.md\")
   (tylko .md; actions/*.jsonl NIGDY nie jest indeksowany)."

# Loop guard (mandatory) — identical pattern to completion-nudge.sh: if the stop was already triggered
# by a prior hook pass (stop_hook_active), do nothing. ONE node process does the guard (and, in block
# mode, the JSON emit: hook-io emit-block --guard reads "<stdin JSON>\0<reason>").
case "${SCAFFOLDING_MEMORY_INGEST:-}" in
    block)
        # Enforce: force one more turn. The loop guard makes this fire at most once
        # (the re-prompt's Stop event carries stop_hook_active=true).
        printf '%s\0%s' "$INPUT" "$REASON" | node "$LIB/hook-io.mjs" emit-block --guard stop_hook_active 2>/dev/null
        ;;
    *)
        # Advisory (default when env unset) — never blocks.
        STOP_ACTIVE=$(printf '%s' "$INPUT" | node "$LIB/hook-io.mjs" get --bool stop_hook_active 2>/dev/null)
        [ "$STOP_ACTIVE" = "true" ] && exit 0
        printf '%s\n' "$REASON" >&2
        ;;
esac

exit 0
