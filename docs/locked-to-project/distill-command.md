# /distill command

## What it is

The `/distill` slash command analyzes past Claude Code session transcripts
(`~/.claude/projects/**/*.jsonl`) and extracts insights, patterns, and root
causes into a structured knowledge base. It is powered by
`distill/cli.py` in the origin repo plus a Postgres-backed storage layer.

## Why not in scaffolding

`distill` is specific to mining telemetry from Claude Code session logs using
tools tightly coupled to the origin backend. Three dependencies:

- `distill/cli.py` (Python CLI, origin-repo-only)
- Postgres database for storing distilled insights
- A schema that assumes the origin repo's session layout

There is no meaningful way to ship this as markdown alone.

## How to enable in your project

Not recommended. Distill is effectively an internal tool for the
`scaffolding.tool` development team. If you want a similar capability:

- Look at `sessfind` (Gosc's session analysis tool) for read-only discovery
- Write your own `jq` pipelines over `~/.claude/projects/**/*.jsonl`
- Use the semantic-memory MCP server to store insights as you discover them

## Fallback

None. `/distill` has no portable counterpart. If you need cross-session
pattern discovery in scaffolding, use `semantic_search` via the
`semantic-memory-mcp` skill instead.
