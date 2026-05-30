#!/usr/bin/env bash
# SessionStart hook — compute a stable per-project id for semantic-memory scoping.
#
# Emits the project_id as additionalContext so agents pass it to the
# mcp__semantic-memory__* tools, isolating memory per repository (shared across
# the user's devices, since it derives from the git remote, not the local path).
#
# No-op-safe: if semantic memory isn't enabled, the injected note is harmless.
set -euo pipefail

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
remote="$(git -C "$dir" config --get remote.origin.url 2>/dev/null || true)"
key="${remote:-$(cd "$dir" 2>/dev/null && pwd || echo "$dir")}"

if command -v sha256sum >/dev/null 2>&1; then
  h="$(printf '%s' "$key" | sha256sum | cut -c1-16)"
else
  h="$(printf '%s' "$key" | shasum -a 256 | cut -c1-16)"
fi
pid="scaffold:${h}"

# Cache for other tooling.
mkdir -p "$dir/.scaffolding" 2>/dev/null || true
printf '%s\n' "$pid" > "$dir/.scaffolding/project-id" 2>/dev/null || true

ctx="semantic-memory project_id = ${pid}. When the mcp__semantic-memory__* tools are available, ALWAYS pass project_id=\"${pid}\" to semantic_search, semantic_recall, and semantic_store so memory stays isolated per project (and shared across your devices)."

# SessionStart additionalContext injection.
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' \
  "$(printf '%s' "$ctx" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$ctx")"
