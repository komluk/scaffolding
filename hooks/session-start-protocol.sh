#!/usr/bin/env bash
# session-start-protocol.sh
# Outputs JSON with hookSpecificOutput.additionalContext so that Claude Code
# injects the routing protocol at full context weight (not low-priority debug).
# Reference: Claude Code hook docs -- SessionStart JSON output format.

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "## Scaffolding Protocol (active)\n\nFull routing table is in CLAUDE.md. Core rules:\n- Delegate real engineering work (writing/modifying code, system/API design, debugging, multi-step tasks) via Task(subagent_type=\"scaffolding:<agent>\", prompt=\"...\"); trivial, factual, or conversational questions MAY be answered directly. Never edit code/docs directly as part of engineering work.\n- NEVER use general-purpose or explore subagent types — hard rule, hook-enforced (plan mode is allowed).\n- Agents: analyst, architect, researcher, developer, debugger, reviewer, optimizer, prompt-engineer, mcp-builder, tech-writer, devops, gitops, coordinator.\n- After any worktree agent finishes, hand off to scaffolding:gitops to commit/merge/push.\n- Response format: [Agent: name] Task -> Result."
  }
}
EOF
exit 0
