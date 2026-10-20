---
name: semantic-memory-mcp
description: "Search, recall and store using the memory MCP tools (search_context, semantic_search, semantic_recall, semantic_store, notes). TRIGGER when: searching prior insights mid-task, or deciding whether and how to store an insight or note. SKIP: repo file tiers under .scaffolding/ (use agent-memory); scoring /learn candidates (use distill)."
---

# Semantic Memory MCP Usage

You have access to a subset of the 13 memory MCP tools. Use the search/recall tools PROACTIVELY -- do not wait to be asked. Only call a tool your agent's `tools:` frontmatter actually grants; that frontmatter is authoritative. See the `mcp-tools` skill for the full 13-tool inventory and access table.

## Tools Available

| Tool | Purpose |
|------|---------|
| `search_context` | Search ingested context chunks |
| `semantic_search` | Find memories by similarity query |
| `semantic_recall` | Get formatted memories for current context |
| `semantic_store` | Store a new memory with embedding |
| `store_note` / `read_note` / `list_notes` | Persist/read/list note documents |
| `trigger_ingest` | Queue one just-written document (`corpus` + `relative_path`) for immediate indexing (~3s to become searchable) instead of waiting up to 15 minutes |

`trigger_ingest` is only useful paired with `store_note` (otherwise you are re-indexing a document you didn't write), and each call costs an LLM context-gen call. It is path-scoped to a single document -- it cannot trigger a full backfill -- and it is fire-and-forget: it returns once the document is queued, not once indexing completes. Don't expect a synchronous "done" result; the document becomes searchable a few seconds later.

> **Note**: If this skill is active in a repository without the `memory` MCP server, skip these instructions. An agent without `mcp__memory__*` tools should simply work without semantic memory -- the file-based fallback in `.scaffolding/agent-memory/` (see the `agent-memory` skill) keeps working. Never block on missing infrastructure.

## Automatic Baseline

Baseline recall and store already happen without you:
- **Recall**: injected at prompt/task start by the `memory-recall.sh` hook (interactive, `<recalled-memories>`) or the platform `MEMORY_AUTO_RECALL` (`## Relevant project memory`).
- **Store**: the memory-ingest Stop hook runs `distill` and auto-stores high-confidence candidates; the platform `MEMORY_AUTO_STORE` stores the 1-3 bullets of your final `## Remember` section. Apply the same Quality Gate below to those bullets.

Manual calls are for *targeted* mid-task queries and explicit stores.

## WHEN to Search Memory

### At task start (MANDATORY for these scenarios):
- You encounter an **unfamiliar pattern** or module you haven't worked with before
- The task involves a **subsystem with known quirks** (deployment, async, database)
- You are **debugging** and the error message or stack trace is unclear
- You are making an **architecture or design decision**

### Mid-task (RECOMMENDED):
- You hit an **unexpected error** -- search for the error message or pattern
- You are about to **implement a workaround** -- check if someone already solved it
- You need to understand **why a decision was made** in the codebase

### How to search effectively:
- Use natural language queries describing the problem, not code snippets
- Keep queries under 100 words for best embedding match
- Use `semantic_search` when you want structured results with metadata
- Use `semantic_recall` when you want a quick formatted summary
- **Always pass `project_id`** so results are scoped to the current repository.
  The `memory-project-id` SessionStart hook injects the value to use (a
  `scaffold:<hash>` derived from the git remote); pass that exact value to
  every `semantic_search` / `semantic_recall` / `semantic_store` call. If no
  `project_id` is provided in session context, the backend uses a shared
  `default` namespace. Note: `project_id` (this section's mem0 axis) is distinct
  from `corpus` (used by `search_context`/notes/`trigger_ingest`, one of three
  NFS share directories) — don't conflate the two.

### Examples:
```
semantic_recall(context="SQLAlchemy async session event loop issues", project_id="scaffold:ab12cd34ef56")
semantic_search(query="deployment nginx proxy configuration gotchas", project_id="scaffold:ab12cd34ef56")
semantic_search(query="Redis task queue timeout handling", project_id="scaffold:ab12cd34ef56", agent_name="debugger")
```

## WHEN to Store Memory (Write Agents Only)

### MUST store (after confirming the insight is correct):
- **Root cause of a non-obvious bug** -- especially if it took >5 minutes to find
- **Architecture decision with rationale** -- why X was chosen over Y
- **Integration gotcha** -- something that fails silently or behaves unexpectedly
- **Pattern that deviates from convention** -- and why the deviation exists

### SHOULD store:
- **Workaround for a known limitation** -- with context on when it applies
- **Performance finding** -- specific numbers or thresholds discovered
- **Configuration requirement** -- non-obvious setup step that blocks progress

### Do NOT store:
- Task-specific context (use conversation memory instead)
- Information already in CLAUDE.md, docs/, or KNOWLEDGE.md
- Speculative or unverified conclusions
- Raw code snippets >500 chars (summarize the insight instead)
- Routine operations (file created, test passed, etc.)

### How to store effectively:
- Write content as a **self-contained insight** another agent can understand without context
- Include the **why**, not just the what
- Use descriptive `tags` for filtering (3-5 tags)
- Set `content_type` correctly: `learning`, `error`, `pattern`, or `decision`
- Keep content under 500 chars when possible (max 2000)
- Pass `agent_name`, `project_id` and optionally `task_id` / `conversation_id`

### Content types

| Type | Use When |
|------|----------|
| `learning` | General knowledge, best practices, how-to (default) |
| `error` | Root cause analysis, error resolution steps |
| `pattern` | Confirmed code or architecture pattern |
| `decision` | Architecture or design decision with rationale |

### Search first, then store
Hash dedup only catches byte-identical content, and backends that distil input into atomic memories (e.g. mem0) split one store call into several entries -- a reworded fact silently bloats the store. Before `semantic_store`, run `semantic_search`; if a near-duplicate exists, update or skip rather than adding a paraphrase.

### Pointer only -- no secrets, no paths
The vector store holds short, self-contained insights or a short *pointer* to a file memory -- never the duplicated body. Never store secrets, tokens, or file-system paths. Secrets and memory/MCP recovery procedures stay in local file memory only (see `agent-memory`).

### File memory vs vector memory

| System | Mechanism | Best for |
|--------|-----------|----------|
| File (`agent-memory` skill) | Markdown in `.scaffolding/` | Curated, structured, source-of-truth reference; always readable even if the store is down |
| Vector (this skill) | Embedding search via MCP | Fuzzy, natural-language-discoverable insights |

Use both: file for well-organized reference, vector for fuzzy-match discovery.

### Examples:
```
semantic_store(
  content="TextBuffer in step event pipeline buffers assistant_text and thinking events but passes all others through immediately. If you add a new bufferable event type, you must add it to TextBuffer._BUFFERED_TYPES or events will be lost silently.",
  agent_name="debugger",
  content_type="pattern",
  tags=["step-events", "text-buffer", "pipeline"]
)

semantic_store(
  content="When creating async SQLAlchemy engine in a worker thread, you must create a NEW engine+session bound to that thread's event loop. Reusing the module-level async_session_maker causes 'attached to a different loop' errors.",
  agent_name="developer",
  content_type="error",
  tags=["sqlalchemy", "async", "threading", "event-loop"]
)
```

## Quality Gate

Before storing, self-check:
1. Is this insight **reusable** by future agents? (not task-specific)
2. Is it **verified** through actual experience? (not speculative)
3. Is it **not already documented** in CLAUDE.md, docs/, or agent-memory files?
4. Would it save another agent **>5 minutes** of investigation?

If all four are YES, store it. Otherwise, skip or use file-based conversation memory.
