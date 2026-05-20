---
name: semantic-memory-store
description: "Store reusable insights in semantic memory for vector-similarity recall. TRIGGER when: an agent discovers a pattern, decision, or gotcha worth retrieving later via embedding search. SKIP: searching/recalling memory (use semantic-memory-mcp); file-based memory writes (use agent-memory)."
---

# Semantic Memory Store

Store knowledge as vector-embedded entries in an optional semantic memory service. When the service is available, entries are automatically embedded and retrievable via cosine similarity search by any agent in future sessions.

This skill is **optional**. If no semantic memory service is configured, agents should degrade gracefully and rely on the file-based memory described in the `agent-memory` skill.

## When to Use

- Agent discovers a non-obvious insight worth preserving beyond file-based memory
- A debugging session reveals a root cause that would help future agents
- An architectural decision is made that affects multiple components
- A pattern or anti-pattern is confirmed through implementation experience
- Cross-project knowledge that does not belong in a single file

## When NOT to Use

- Temporary task context (use conversation memory in `.scaffolding/conversations/`)
- Information already in CLAUDE.md, docs/, or KNOWLEDGE.md
- Large code snippets (use file-based memory instead)
- Speculative or unverified conclusions

## Availability Check

Before attempting to store or search, verify a semantic memory backend is reachable:

- If `mcp__semantic-memory__*` MCP tools are available, use those (see the `semantic-memory-mcp` skill).
- If an optional backend service is configured for the project, use its documented interface.
- If neither is available, **skip this skill entirely** and use file-based memory from the `agent-memory` skill. Do not block on missing infrastructure.

## How to Store

When a semantic memory backend is available, store an entry with the following fields. The backend embeds the content and persists it for similarity search.

### Parameter Reference

| Parameter | Required | Description |
|-----------|----------|-------------|
| `content` | Yes | Text to embed and store (keep concise; long content may be truncated) |
| `agent_name` | No | Agent that created this memory (e.g. `developer`, `debugger`) |
| `content_type` | No | One of: `learning`, `error`, `pattern`, `decision` (default: `learning`) |
| `tags` | No | List of string tags for filtering |
| `task_id` | No | Source task ID if applicable |
| `project_id` | No | Associated project ID |
| `conversation_id` | No | Associated conversation ID |

### Content Types

| Type | Use When |
|------|----------|
| `learning` | General knowledge, best practices, how-to |
| `error` | Root cause analysis, error resolution steps |
| `pattern` | Confirmed code pattern, architecture pattern |
| `decision` | Architecture or design decision with rationale |

## Examples

### Store a debugging insight

Store an entry with:

- `content`: "SQLAlchemy async_session_maker bound to one event loop cannot be reused in a worker thread. Create a fresh engine+session per thread to avoid attached-to-different-loop errors."
- `agent_name`: `debugger`
- `content_type`: `error`
- `tags`: `["sqlalchemy", "async", "threading"]`

### Store an architectural decision

Store an entry with:

- `content`: "Semantic memory uses a local all-MiniLM-L6-v2 model (384 dims) instead of a hosted embedding API. Zero cost, fast, runs on CPU. Trade-off: lower quality than a hosted model but no API dependency."
- `agent_name`: `architect`
- `content_type`: `decision`
- `tags`: `["semantic-memory", "embedding", "architecture"]`

## How Retrieval Works

When a semantic memory backend is available, stored memories are automatically recalled by the agent execution pipeline. When a task starts, the pipeline:

1. Embeds the task prompt using the same model
2. Performs cosine similarity search against stored memories
3. Returns top-K results within a distance threshold
4. Injects matching memories into the agent's context as `## Semantic Memory`

No manual retrieval is needed. Agents that want to search for specific memories can use the `semantic_search` MCP tool described in the `semantic-memory-mcp` skill.

## Prerequisites

Semantic memory requires an optional backend service. If your project does not configure one, this skill is inert and file-based memory remains fully functional. When a backend is configured, it typically requires:

- The semantic memory feature enabled in the backend configuration
- A datastore for embedded entries
- An embedding model available to the backend

Consult your project's setup documentation for the exact configuration. Absence of any of these means the skill degrades gracefully to file-based memory.

## Deduplication

When supported by the backend, content is deduplicated by hash. Storing the same content twice updates the existing entry (merges tags, updates timestamp) instead of creating a duplicate.

## Relationship to File-Based Memory

| System | Mechanism | Best For |
|--------|-----------|----------|
| File-based (agent-memory skill) | Markdown files in `.scaffolding/` | Structured, curated knowledge with manual organization |
| Semantic memory (this skill) | Vector store with embedding search | Discoverable knowledge via natural language similarity |

Use both when available: file-based memory for well-organized reference material, semantic memory for fuzzy-match discoverable insights. When semantic memory is unavailable, file-based memory alone is sufficient.
