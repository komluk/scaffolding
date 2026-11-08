#!/usr/bin/env bash
# UserPromptSubmit hook — opt-in semantic memory recall.
#
# When SCAFFOLDING_MEMORY_RECALL=on, sends the prompt (first 500 chars) to the memory MCP
# `semantic_search` tool with one stateless JSON-RPC `tools/call` POST and injects the hits
# as additionalContext. The server applies the distance cutoff, so an empty result means
# "no relevant memory" and nothing is injected.
#
# Config (env only, nothing hard-coded):
#   SCAFFOLDING_MEMORY_RECALL         on|off (default off)
#   SCAFFOLDING_MEMORY_RECALL_URL     MCP endpoint. https anywhere; plain http only when the host
#                                     resolves exclusively to loopback/private (RFC 1918) addresses.
#   SCAFFOLDING_MEMORY_RECALL_TOKEN   Bearer token. If unset, ANTHROPIC_API_KEY is used ONLY when
#                                     the URL host equals the ANTHROPIC_BASE_URL host (i.e. your
#                                     own gateway), so a real API key never goes to a third party.
#   SCAFFOLDING_MEMORY_RECALL_TOOL    tool name (default memory-semantic_search)
#   SCAFFOLDING_MEMORY_RECALL_TIMEOUT seconds (default 2, capped at 2.5 to stay under the 3 s hook limit)
#
# Fail-silent: on any error, timeout, skip or zero hits it prints nothing and exits 0.
# Redirects are refused and proxies ignored, so the token only ever goes to the configured URL.
# Needs node >= 22 (logic in lib/memory-recall.mjs); without node it does nothing.
[ "${SCAFFOLDING_MEMORY_RECALL:-off}" = "on" ] || exit 0
[ -n "${SCAFFOLDING_MEMORY_RECALL_URL:-}" ] || exit 0
command -v node >/dev/null 2>&1 || { echo "scaffolding: node not found, memory-recall not enforced" >&2; exit 0; }
command -v timeout >/dev/null 2>&1 || exit 0

LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib/memory-recall.mjs"
[ -f "$LIB" ] || exit 0

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
pid=""
[ -f "$dir/.scaffolding/project-id" ] && pid="$(head -n1 "$dir/.scaffolding/project-id" 2>/dev/null)"
export RECALL_PID="$pid"

# The token reaches node via the environment only — never on a command line (ps-visible).
timeout 2.8 node "$LIB" 2>/dev/null || true
exit 0
