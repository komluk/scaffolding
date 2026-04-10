# semantic-memory MCP server

## What it is

An MCP (Model Context Protocol) server that provides three tools to agents:

- `semantic_search(query)` -- find past memories by embedding similarity
- `semantic_recall(context)` -- get formatted memories for current task
- `semantic_store(content, ...)` -- persist a new memory with embedding

It runs as a Python process launched via stdio by Claude Code (see `.mcp.json`
in the origin repo) and stores vectors in Postgres with pgvector.

## Why not in scaffolding

Three hard dependencies:

1. **Postgres with pgvector extension** -- not a file, requires DB install.
2. **Embedding model** (sentence-transformers or similar) -- large download,
   not something to ship in a config repo.
3. **Schema + migrations** -- lives inside `app/backend/semantic_memory/`,
   tightly coupled to the origin backend.

Shipping the markdown skill (`skills/semantic-memory-mcp/SKILL.md`) without
this server would mean agents reference MCP tools that do not exist. The
SKILL.md in scaffolding has a defensive note telling the agent to skip the
section if `mcp__semantic-memory__*` tools are unavailable.

## How to enable in your project

1. Clone the origin backend (or reimplement): `app/backend/semantic_memory/`
2. Run Postgres with pgvector (`CREATE EXTENSION vector;`)
3. Run the migration to create the `semantic_memories` table
4. Add a `.mcp.json` entry:
   ```json
   {
     "mcpServers": {
       "semantic-memory": {
         "command": "path/to/venv/bin/python",
         "args": ["-m", "semantic_memory.mcp_server"]
       }
     }
   }
   ```
5. Restart Claude Code

Without this, the fallback is the file-based 3-tier memory in
`.scaffolding/agent-memory/` which all agents use as default.
