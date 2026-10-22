#!/usr/bin/env bash
# Guards the LSP-first wiring: Claude Code pushes publishDiagnostics to the model after
# Edit/Write by itself (no hook needed) as long as an lspServers entry is connected and
# does not set `diagnostics: false`. The four code-facing agents must also carry the
# findReferences / goToDefinition / documentSymbol rules and be allowed to call graphify.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
ROOT="$(cd "$HOOKS_DIR/.." && pwd)"

echo "lspServers: diagnostics stay enabled"
off=$(jq '[.lspServers[] | select(.diagnostics == false)] | length' "$ROOT/.claude-plugin/plugin.json")
check "no lspServers entry sets diagnostics:false" [ "$off" = "0" ]
for s in typescript python; do
    check "lspServers.$s is defined" jq -e ".lspServers.$s.command" "$ROOT/.claude-plugin/plugin.json" >/dev/null
done

for a in developer debugger reviewer architect optimizer analyst; do
    f="$ROOT/agents/$a.md"
    echo "agent: $a"
    check "$a tools include LSP" grep -qE '^tools:.*(^|, )LSP(,|$)' "$f"
    check "$a tools include mcp__graphify__query_graph" grep -qE '^tools:.*mcp__graphify__query_graph' "$f"
    check "$a rule: findReferences before rename/remove/signature change" grep -q 'findReferences' "$f"
    check "$a rule: graphify tools referenced" grep -q 'mcp__graphify__' "${f}"
done
for a in developer debugger reviewer architect; do
    check "$a rule: goToDefinition / documentSymbol for navigation" grep -q 'goToDefinition.*documentSymbol' "$ROOT/agents/$a.md"
done
for a in developer debugger; do
    f="$ROOT/agents/$a.md"
    echo "checklist: $a"
    check "$a has the mandatory checklist" grep -q 'Mandatory LSP/graph checklist' "$f"
    check "$a checklist: graphify dependents before multi-file change" grep -q 'multi-file change: run `mcp__graphify__get_neighbors`' "$f"
    check "$a checklist: read diagnostics after edits" grep -q 'After edits: read the diagnostics' "$f"
done
f="$ROOT/agents/reviewer.md"
echo "reviewer: impact-analysis contract"
check "reviewer requires the impact-analysis step before verdict" grep -q 'Impact Analysis (MANDATORY' "$f"
for k in '```impact-analysis' '^changed: \[' '^dependents: N \(top: a, b, c\)' '^risk: low|medium|high' '^notes: '; do
    check "reviewer block has: $k" grep -qE -- "$k" "$f"
done
check "reviewer: no hallucinated numbers when tools missing" grep -q 'never invent counts' "$f"
check "reviewer: findReferences + get_neighbors named" grep -q 'mcp__graphify__get_neighbors' "$f"
finish
