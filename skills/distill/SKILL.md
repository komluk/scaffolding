---
name: distill
description: "Knowledge distillation methodology: candidate extraction, confidence scoring, tier routing, conversation-scoped mode. TRIGGER when: running /learn or /distill, deciding if an insight is memory-worthy, or scoring a knowledge candidate. SKIP: ad-hoc memory reads/writes (use agent-memory); vector storage (use semantic-memory-store)."
---

# Distill Methodology

Guidelines for automated knowledge extraction and consolidation across memory systems.

## Knowledge Candidate Criteria

An insight qualifies as a knowledge candidate when it meets ANY of these:

| Criterion | Source | Example |
|-----------|--------|---------|
| Cross-conversation pattern | 3+ context.md files contain the same insight | "Redis pool exhaustion under SSE load" |
| Architectural decision | design.md contains explicit Decision/Rationale section | "Use pgvector for semantic search" |
| Recurring gotcha/bug | Keyword match in specs: gotcha, bug, pattern, lesson | "POST 301 redirect strips body" |
| Stale reference | File path in memory points to non-existent file | "app/backend/old_module.py" |
| Cross-tier duplicate | Same entry in both KNOWLEDGE.md and agent MEMORY.md | Duplicated bullet point |

## Confidence Scoring

| Occurrences | Confidence | Tier Recommendation |
|-------------|------------|---------------------|
| 5+ conversations | 0.5 - 1.0 | shared (KNOWLEDGE.md) |
| 3-4 conversations | 0.3 - 0.5 | shared (with review) |
| 1-2 conversations | 0.1 - 0.2 | agent-specific MEMORY.md |
| Decision section | 0.7 fixed | shared |
| Pattern keyword | 0.5 fixed | shared |
| Stale reference | 0.9 fixed | cleanup action |

## Tier Routing

| Target | When | Path |
|--------|------|------|
| `shared` | Cross-cutting insight useful to all agents | `.scaffolding/agent-memory/shared/KNOWLEDGE.md` |
| `agent:{name}` | Domain-specific to one agent | `.scaffolding/agent-memory/agents/{name}/MEMORY.md` |
| Overflow | KNOWLEDGE.md would exceed 200 lines | Route to most relevant agent file |

## Output Format

Candidates are structured as:

```
- content: The knowledge text (max 500 chars)
- source: File path or "conversations:N_occurrences"
- source_type: conversation | spec | memory | semantic
- confidence: 0.0-1.0
- target_tier: shared | agent:{name}
- tags: categorization tags
```

## 200-Line Limit Enforcement

KNOWLEDGE.md has a hard limit of 200 lines (auto-injected into every agent context). When merging would exceed this limit:

1. High-confidence candidates (>= 0.7) get priority
2. Lower-confidence candidates overflow to agent-specific files
3. The orchestrator routes overflow to the most relevant agent based on tags

## Dry-Run vs Apply

- **Dry-run** (default): Report what would change, write nothing
- **Apply**: Create timestamped backup, then write merged content
- **Restore**: Revert files from any backup timestamp

## Conversation-Scoped Distillation

The `/learn` command runs distillation against a **single conversation** rather
than mining all of `.scaffolding/conversations/`. This mode is backend-free and
self-contained — no session-log mining, no database.

Inputs for one `conversation_id` (a UUID `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`):

| Input | Path | Role |
|-------|------|------|
| Conversation memory | `.scaffolding/conversations/{id}/agent-memory/context.md` | Decisions and findings recorded during the chain |
| Design decisions | `.scaffolding/conversations/{id}/specs/design.md` (`## Decisions` section, if present) | Architectural choices + rationale |

Apply the Knowledge Candidate Criteria and Confidence Scoring above against these
two files only. With a single conversation, the "Cross-conversation pattern"
criterion does not apply; rely on the Decision-section and pattern-keyword
criteria. If `context.md` is absent, there is nothing to distill — exit cleanly.

## Skill Promotion Criterion

Each distilled candidate routes to one of two destinations:

| Candidate shape | Destination | Decision rule |
|-----------------|-------------|---------------|
| Situational insight, gotcha, or one-off decision | Memory entry — `shared`, `agent:{name}`, or conversation tier per the Tier Routing rules above | The knowledge is a *fact about this codebase*. |
| Repeatable procedure or methodology | New skill — propose a `/create-skill` invocation with a pre-filled draft | The knowledge is a *reusable how-to* an agent would follow on future, unrelated tasks. |

Promote to a skill only when the candidate is a generalizable procedure, not a
single fact. A one-off fact ("module X has a 301 redirect bug") is a memory
entry; a recurring procedure ("how to safely roll a zero-downtime migration") is
a skill. When in doubt, prefer a memory entry — skills carry an auto-invocation
cost and should stay few and sharp.
