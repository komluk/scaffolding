#!/usr/bin/env bash
# session-start-protocol.sh
# Outputs JSON with hookSpecificOutput.additionalContext so that Claude Code
# injects the routing protocol at full context weight (not low-priority debug).
# Reference: Claude Code hook docs -- SessionStart JSON output format.

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "## Scaffolding Protocol (active)\n\nFull routing table is in CLAUDE.md. Core rules:\n- Delegate EVERY task via Task(subagent_type=\"scaffolding:<agent>\", prompt=\"...\"). Never edit code/docs directly.\n- NEVER use general-purpose or explore subagent types (plan mode is allowed).\n- Agents: analyst, architect, researcher, developer, debugger, reviewer, optimizer, prompt-engineer, mcp-builder, tech-writer, devops, gitops, coordinator.\n- After any worktree agent finishes, hand off to scaffolding:gitops to commit/merge/push.\n- Response format: [Agent: name] Task -> Result."
  }
}
EOF
exit 0
