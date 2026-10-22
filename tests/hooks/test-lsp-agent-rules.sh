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

for a in developer debugger reviewer architect; do
    f="$ROOT/agents/$a.md"
    echo "agent: $a"
    check "$a tools include LSP" grep -qE '^tools:.*(^|, )LSP(,|$)' "$f"
    check "$a tools include mcp__graphify__query_graph" grep -qE '^tools:.*mcp__graphify__query_graph' "$f"
    check "$a rule: findReferences before rename/remove/signature change" grep -q 'findReferences' "$f"
    check "$a rule: goToDefinition / documentSymbol for navigation" grep -q 'goToDefinition.*documentSymbol' "$f"
    check "$a rule: graphify for architecture questions" grep -q 'Graphify graph exists' "$f"
done
finish
