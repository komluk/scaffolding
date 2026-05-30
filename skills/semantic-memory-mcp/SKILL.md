---
name: semantic-memory-mcp
description: "Proactive use of semantic-memory MCP tools (semantic_search, semantic_recall). TRIGGER when: an agent should search vector memory for prior insights mid-task. SKIP: file-based 3-tier memory (use agent-memory); storing a new memory (use semantic-memory-store)."
---

# Semantic Memory MCP Usage

You have access to three MCP tools for semantic memory. Use them PROACTIVELY -- do not wait to be asked.

## Tools Available

| Tool | Purpose | All agents | Write agents only |
|------|---------|------------|-------------------|
| `semantic_search` | Find memories by similarity query | Yes | -- |
| `semantic_recall` | Get formatted memories for current context | Yes | -- |
| `semantic_store` | Store a new memory with embedding | -- | Yes |

Write agents: developer, architect, debugger, analyst, researcher, reviewer, optimizer.
Read-only agents: tech-writer, devops, gitops.

> **Uwaga**: Jesli ten skill jest aktywny w repozytorium bez MCP server `semantic-memory`, pomin te instrukcje. Agent bez dostepu do `mcp__semantic-memory__*` toolow powinien po prostu pracowac bez pamieci semantycznej -- file-based fallback w `.scaffolding/agent-memory/` wciaz dziala.

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
  `default` namespace.

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
