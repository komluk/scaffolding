---
name: mcp-tools
description: "MCP tool decision tree and MCP-first fallback strategy. TRIGGER when: choosing whether to use an MCP tool versus a built-in, or an MCP tool is available for a task. SKIP: semantic-memory MCP usage specifically (use semantic-memory-mcp)."
---

# MCP Tools Decision Tree

## Priority Order

1. Does an MCP tool exist for this operation? **Use it first.**
2. Did the MCP tool fail (auth missing, plugin unavailable)? **Fall back to built-in.**
3. No MCP tool matches? **Use built-in tools** (Bash, Grep, WebSearch, etc.).

## MCP Plugin Quick Reference

| Plugin | Transport | Key Tools | Agents |
|--------|-----------|-----------|--------|
| context7 | stdio | `mcp__context7__resolve-library-id`, `mcp__context7__get-library-docs` | researcher, developer |
| playwright | stdio | `mcp__playwright__browser_navigate`, `mcp__playwright__browser_screenshot` | developer, debugger |
| eslint | stdio | `mcp__eslint__*` | developer, reviewer |
| sonarqube | docker | `mcp__sonarqube__*` | developer, reviewer |
| sequential-thinking | stdio | `mcp__sequential-thinking__*` | architect, debugger |
| postgres-mcp | stdio | `mcp__postgres-mcp__*` | developer, optimizer |
| redis-mcp | stdio | `mcp__redis-mcp__*` | developer, devops, debugger |
| docker | stdio | `mcp__docker__*` | devops |
| cron | stdio | `mcp__cron__*` | devops |
| ssh-mcp | stdio | `mcp__ssh-mcp__*` | devops |
| github | http | `mcp__github__*` | gitops, architect |
| google-sheets | stdio | `mcp__google-sheets__*` | researcher, tech-writer |
| slack | sse | `mcp__slack__*` | tech-writer |
| asana | sse | `mcp__asana__*` | architect |
| supabase | http | `mcp__supabase__*` | optimizer |
| firebase | stdio | `mcp__firebase__*` | devops, optimizer |
| memory | stdio | 13 tools across search/store/notes/ingest/session tiers (see below) | tiered — see Access Control |

## Semantic Memory MCP

- **Transport**: stdio (Python, `venv/bin/python -m mcp_servers.semantic_memory`)
- **Source**: MCP servers in your backend directory (internal, built on `fastmcp`)
- **Auth**: `DATABASE_URL` (PostgreSQL connection string), `SEMANTIC_MEMORY_ENABLED=true`
- **Config**: `.mcp.json` at project root

### Tools (13 total)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `search_context` | Search ingested context chunks (Qdrant hybrid retrieval) | `query` (required), `project_id`, `top_k` |
| `semantic_search` | Search memories by similarity | `query` (required), `project_id`, `agent_name`, `top_k`, `threshold` |
| `semantic_recall` | Recall relevant memories as markdown | `context` (required), `agent_name`, `project_id`, `top_k` |
| `semantic_store` | Store a new memory with embedding | `content` (required), `agent_name` (required), `project_id`, `conversation_id`, `task_id`, `tags`, `content_type` |
| `store_note` | Persist a note document | `project`, `relative_path`, `content` (see notes-tier agents) |
| `read_note` | Read a note document | `project`, `relative_path` |
| `list_notes` | List note documents | `project` |
| `trigger_ingest` | Queue ONE document (`project` + `relative_path`) for immediate re-indexing so a note just written via `store_note` becomes searchable in seconds instead of up to 15 minutes. Path-scoped only — cannot trigger a full backfill. Returns once queued; does not wait for indexing to finish (~3s to become searchable). Only useful to agents that also have `store_note` — otherwise you'd be re-indexing someone else's file. | `project` (required), `relative_path` (required) |
| `list_sessions` | List memory sessions (catalog) | — |
| `get_session` | Get a session's details | `session_id` |
| `semantic_list` | List stored memories (catalog) | `project_id` |
| `semantic_delete` | Delete a memory | `memory_id` (granted to no agent) |
| `archive_session` | Archive a session | `session_id` (granted to no agent) |

### Access Control

| Tier | Tools | Agents |
|------|-------|--------|
| Write (search/recall/store) | `search_context`, `semantic_search`, `semantic_recall`, `semantic_store` | developer, architect, debugger, analyst, researcher, reviewer, optimizer |
| Read-only | `search_context`, `semantic_search`, `semantic_recall` | tech-writer, devops, gitops, mcp-builder, prompt-engineer |
| Notes | `store_note`, `read_note`, `list_notes` | architect, researcher |
| Ingest trigger | `trigger_ingest` | architect, researcher — narrow grant, restricted to the two agents that also hold `store_note`; broader access would invite wasted LLM context-gen calls re-indexing files the caller didn't write |
| Session catalog | `list_sessions`, `get_session`, `semantic_list` | coordinator |
| Delete/archive | `semantic_delete`, `archive_session` | nobody |

For detailed usage guidance (when to search, when to store, quality gates), see the `semantic-memory-mcp` skill.

## Fallback Strategy

| Operation | MCP Tool (Priority) | Fallback |
|-----------|---------------------|----------|
| Library docs lookup | context7 | WebSearch |
| UI verification | playwright | Manual browser check |
| Code quality | sonarqube | `python3 devops/sonarqube.py` via Bash |
| Linting | eslint | `npx eslint` via Bash |
| Database query | postgres-mcp | `psql` via Bash |
| Cache inspection | redis-mcp | `redis-cli` via Bash |
| Container ops | docker | `docker` via Bash |
| Git operations | github | `gh` CLI via Bash |
| Memory search | memory | File-based agent-memory |
| Remote server | ssh-mcp | `ssh` via Bash |
