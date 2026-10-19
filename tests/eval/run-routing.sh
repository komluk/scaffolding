#!/usr/bin/env bash
# Routing golden-set runner.
#   run-routing.sh --dry-run [--path FILE]   offline: denylist + schema + agent coverage (no API key)
#   run-routing.sh [--path FILE] [--limit N] [--model M]   live: ask `claude -p`, stop at first Task/Agent tool_use
# Exit: 0 ok, 1 failure/low accuracy, 2 usage, 3 denylist hit.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SET="$HERE/routing.jsonl"; DRY=0; LIMIT=0; MODEL=""; TIMEOUT=60
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY=1 ;;
        --path) SET="${2:?--path needs a file}"; shift ;;
        --limit) LIMIT="${2:?--limit needs N}"; shift ;;
        --model) MODEL="${2:?--model needs a name}"; shift ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done
[ -f "$SET" ] || { echo "no such file: $SET" >&2; exit 2; }

bash "$HERE/denylist.sh" "$SET" || exit 3

# Schema: every row has non-empty prompt, expected_agent = scaffolding:<agent>, expected_difficulty key present.
bad=$(jq -c 'select((.prompt|type)!="string" or (.prompt|length)==0
    or ((.expected_agent//"")|test("^scaffolding:[a-z][a-z-]+$")|not)
    or (has("expected_difficulty")|not))' "$SET" | head -3)
[ -z "$bad" ] || { echo "schema error in rows:" >&2; echo "$bad" >&2; exit 1; }
rows=$(jq -c . "$SET" | wc -l)

# Coverage (only for the default set): every agents/*.md appears >=2 times; every expected agent exists.
if [ "$SET" = "$HERE/routing.jsonl" ]; then
    [ "$rows" -ge 30 ] || { echo "need >=30 rows, have $rows" >&2; exit 1; }
    for f in "$ROOT"/agents/*.md; do
        a="scaffolding:$(basename "$f" .md)"
        n=$(jq -r .expected_agent "$SET" | grep -cxF "$a")
        [ "$n" -ge 2 ] || { echo "agent $a has $n rows (need >=2)" >&2; exit 1; }
    done
    for a in $(jq -r .expected_agent "$SET" | sort -u); do
        [ -f "$ROOT/agents/${a#scaffolding:}.md" ] || { echo "unknown agent in set: $a" >&2; exit 1; }
    done
fi

if [ "$DRY" -eq 1 ]; then
    echo "dry-run ok: $rows rows, denylist clean, schema valid"; exit 0
fi
command -v claude >/dev/null || { echo "claude CLI not found" >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/routing-eval.XXXXXX")"; trap 'rm -rf "$WORK"' EXIT
# First Task/Agent tool_use wins (tool is "Agent" in recent CLI versions, "Task" in older ones).
PICK='first(inputs | fromjson? | select(.type=="assistant") | .message.content[]?
    | select(.type=="tool_use" and (.name=="Task" or .name=="Agent")) | .input.subagent_type) // empty'
# Plugin CLAUDE.md is not auto-loaded with --plugin-dir, so feed the routing protocol explicitly.
PROTOCOL="$(cat "$ROOT/CLAUDE.md")"
total=0; hit=0; conf=""
while IFS= read -r row; do
    [ "$LIMIT" -gt 0 ] && [ "$total" -ge "$LIMIT" ] && break
    prompt=$(jq -r .prompt <<<"$row"); exp=$(jq -r .expected_agent <<<"$row")
    args=(-p "$prompt" --output-format stream-json --verbose --no-session-persistence
          --tools Task --strict-mcp-config --setting-sources project --plugin-dir "$ROOT"
          --append-system-prompt "$PROTOCOL")
    [ -n "$MODEL" ] && args+=(--model "$MODEL")
    # Run in an empty dir so the model does not explore a repo; poll the stream and kill claude at the first match.
    out="$WORK/out.jsonl"; : >"$out"
    (cd "$WORK" && exec claude "${args[@]}" </dev/null >"$out" 2>/dev/null) & pid=$!
    got=""
    for _ in $(seq 1 "$TIMEOUT"); do
        got=$(jq -nrR "$PICK" <"$out" 2>/dev/null)
        [ -n "$got" ] && break
        kill -0 "$pid" 2>/dev/null || { got=$(jq -nrR "$PICK" <"$out" 2>/dev/null); break; }
        sleep 1
    done
    kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
    got="${got:-NONE}"; total=$((total + 1))
    if [ "$got" = "$exp" ]; then hit=$((hit + 1)); else conf+="  $exp -> $got  | ${prompt:0:70}"$'\n'; fi
    echo "[$total] ${got} (expected ${exp})"
done <"$SET"

echo "accuracy: $hit/$total"
[ -z "$conf" ] || { echo "confusions (expected -> got):"; printf '%s' "$conf"; }
[ "$total" -gt 0 ]
