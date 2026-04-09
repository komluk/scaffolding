# semantic-memory-store skill

## What it is

A skill in the origin repo whose instructions tell agents to invoke a bash
command that resolves to:

```
<origin>/app/backend/venv/bin/python -m semantic_memory.service ...
```

It is a thin wrapper around the same Python module that powers the
`semantic-memory` MCP server, but invoked synchronously via shell rather than
via MCP stdio.

## Why not in claude-scaffolding

The skill embeds an absolute path to a Python venv that only exists inside
`scaffolding.tool`. Copying it as-is to a fresh repo would produce commands
that fail at runtime.

## How to enable in your project

**Preferred**: use the portable `semantic-memory-mcp` skill (Tier A, shipped
in claude-scaffolding). It exposes the same capabilities via `mcp__semantic-memory__*`
tools, which are discovered automatically by Claude Code when the MCP server
is registered in `.mcp.json`.

**Alternative**: if you insist on a bash-based wrapper, adapt the content of
`skills/semantic-memory-store/SKILL.md` from the origin repo, replace the
hardcoded path with your own venv path, and commit it to your project's
`.claude/skills/` locally. This is not recommended because MCP is the official
path going forward.

## Fallback

Agents without either path still have file-based memory in
`.scaffolding/agent-memory/` (shared/agent/conversation tiers) which works
out-of-the-box with no extra setup.
