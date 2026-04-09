---
name: mcp-tools
description: "MCP tool decision tree and plugin reference. Agents follow MCP-first strategy: attempt MCP tools before falling back to built-in alternatives."
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
| memory | stdio | `mcp__memory__*` | developer, architect |
| sequential-thinking | stdio | `mcp__sequential-thinking__*` | architect, debugger |
| postgres-mcp | stdio | `mcp__postgres-mcp__*` | developer, performance-optimizer |
| redis-mcp | stdio | `mcp__redis-mcp__*` | developer, devops, debugger |
| docker | stdio | `mcp__docker__*` | devops |
| cron | stdio | `mcp__cron__*` | devops |
| ssh-mcp | stdio | `mcp__ssh-mcp__*` | devops |
| github | http | `mcp__github__*` | gitops, architect |
| google-sheets | stdio | `mcp__google-sheets__*` | researcher, tech-writer |
| slack | sse | `mcp__slack__*` | tech-writer |
| asana | sse | `mcp__asana__*` | architect |
| supabase | http | `mcp__supabase__*` | performance-optimizer |
| firebase | stdio | `mcp__firebase__*` | devops, performance-optimizer |
| semantic-memory | stdio | `mcp__semantic-memory__semantic_search`, `mcp__semantic-memory__semantic_store`, `mcp__semantic-memory__semantic_recall` | all agents (see below) |

## Semantic Memory MCP

- **Transport**: stdio (Python, `venv/bin/python -m mcp_servers.semantic_memory`)
- **Source**: MCP servers in your backend directory (internal, built on `fastmcp`)
- **Auth**: `DATABASE_URL` (PostgreSQL connection string), `SEMANTIC_MEMORY_ENABLED=true`
- **Config**: `.mcp.json` at project root

### Tools

| Tool | Purpose | Parameters |
|------|---------|------------|
| `semantic_search` | Search memories by similarity | `query` (required), `project_id`, `agent_name`, `top_k`, `threshold` |
| `semantic_store` | Store a new memory with embedding | `content` (required), `agent_name` (required), `project_id`, `conversation_id`, `task_id`, `tags`, `content_type` |
| `semantic_recall` | Recall relevant memories as markdown | `context` (required), `agent_name`, `project_id`, `top_k` |

### Access Control

| Permission | Agents |
|------------|--------|
| Read + Write (all 3 tools) | developer, architect, debugger, analyst, researcher, reviewer, performance-optimizer |
| Read-only (`semantic_search`, `semantic_recall`) | tech-writer, devops, gitops |

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
| Memory search | semantic-memory | File-based agent-memory |
| Remote server | ssh-mcp | `ssh` via Bash |
