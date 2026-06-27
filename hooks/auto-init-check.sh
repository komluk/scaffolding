#!/usr/bin/env bash
# auto-init-check.sh — SessionStart soft auto-init (startup/resume).
#
# Detects whether the current project is initialized for scaffolding:
#   1. a project-root CLAUDE.md that contains the routing protocol, AND
#   2. .claude/settings.json
# If either is MISSING, injects additionalContext advising the user/Claude to
# run /init-scaffolding.
#
# STRICTLY IDEMPOTENT & NON-DESTRUCTIVE:
#   - NEVER overwrites or creates CLAUDE.md or settings.json.
#   - NEVER clobbers user content.
#   - Only best-effort creates the safe .scaffolding/ skeleton (|| true), the
#     same harmless directory memory-project-id.sh already relies on.
# Always exits 0; SessionStart JSON additionalContext like session-start-protocol.sh.
set +e

dir="${CLAUDE_PROJECT_DIR:-$PWD}"

# --- Detection (read-only) ---
has_routing=0
if [ -f "$dir/CLAUDE.md" ] && grep -q 'subagent_type="scaffolding:' "$dir/CLAUDE.md" 2>/dev/null; then
    has_routing=1
fi

has_settings=0
if [ -f "$dir/.claude/settings.json" ]; then
    has_settings=1
fi

# Already initialized -> nothing to advise. Still emit a valid (empty-context)
# SessionStart object so the hook is well-formed.
if [ "$has_routing" = "1" ] && [ "$has_settings" = "1" ]; then
    exit 0
fi

# --- Safe skeleton only (never touches CLAUDE.md / settings.json) ---
mkdir -p "$dir/.scaffolding/agent-memory/shared" 2>/dev/null || true
mkdir -p "$dir/.scaffolding/agent-memory/agents" 2>/dev/null || true
mkdir -p "$dir/.scaffolding/conversations" 2>/dev/null || true
mkdir -p "$dir/.scaffolding/worktrees" 2>/dev/null || true

# --- Build advisory message ---
missing=""
[ "$has_routing" = "0" ] && missing="${missing}CLAUDE.md routing protocol, "
[ "$has_settings" = "0" ] && missing="${missing}.claude/settings.json, "
missing="${missing%, }"

ctx="scaffolding: this project is not fully initialized (missing: ${missing}). Run /init-scaffolding to install the routing protocol and hooks so agent delegation works here. This is advisory only — no files were overwritten; the safe .scaffolding/ skeleton was created if absent."

# SessionStart additionalContext injection (JSON-escape via python3, with fallback).
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' \
  "$(printf '%s' "$ctx" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$ctx")"

exit 0
