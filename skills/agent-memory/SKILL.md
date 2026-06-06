---
name: agent-memory
description: "3-tier markdown memory protocol (shared/agent/conversation) for cross-session knowledge. TRIGGER when: reading or writing agent memory files, choosing which memory tier an insight belongs in, or starting a task needing prior context. SKIP: vector recall (use semantic-memory-mcp); distilling conversations into candidates (use distill)."
---

# Agent Memory Protocol

3-tier persistent memory system for cross-session knowledge accumulation.

## Memory Tiers

| Tier | Path | Scope | Written By | Read By |
|------|------|-------|------------|---------|
| **Shared** | `.scaffolding/agent-memory/shared/KNOWLEDGE.md` | Whole project | Any agent | All agents |
| **Agent** | `.scaffolding/agent-memory/agents/{agent-name}/MEMORY.md` | Per agent | Owning agent | Own agent + architect |
| **Conversation** | `.scaffolding/conversations/{conversation_id}/agent-memory/context.md` | Per conversation | Any agent in conversation | Agents in same conversation |

## Automatic Injection

Memory is auto-injected into agent context via `recall_for_agent()` in the task execution pipeline. When a task starts, the system reads:
1. `.scaffolding/agent-memory/shared/KNOWLEDGE.md` (always)
2. `.scaffolding/agent-memory/agents/{agent-name}/MEMORY.md` (when agent_name is known)
3. `.scaffolding/conversations/{id}/agent-memory/context.md` (when conversation_id is provided)

This means agents receive memory context automatically. Manual reading on first turn is optional but recommended for verifying latest data.

## On First Turn

Before starting work, optionally read available memory for latest content (skip if files don't exist):

1. Read `.scaffolding/agent-memory/shared/KNOWLEDGE.md`
2. Read `.scaffolding/agent-memory/agents/{your-agent-name}/MEMORY.md`
3. If `conversation_id` is provided in task context: Read `.scaffolding/conversations/{conversation_id}/agent-memory/context.md`

## Before Completing

Write significant findings to the appropriate tier:

### Shared Knowledge (KNOWLEDGE.md)
Save here:
- Project architecture facts confirmed across multiple tasks
- Deployment gotchas and infrastructure quirks
- Cross-cutting patterns (e.g. how Redis is used, how tasks flow)
- Known bugs or limitations that affect multiple agents

Do NOT save:
- Agent-specific patterns (use agent memory)
- Task-specific context (use conversation memory)
- Anything already in CLAUDE.md or docs/

### Agent Memory (MEMORY.md)
Save here:
- Patterns specific to your agent's domain (e.g. developer saves coding patterns)
- Lessons learned from mistakes in your domain
- File locations you frequently need
- Recurring debugging insights

Do NOT save:
- Generic project facts (use shared knowledge)
- One-time task details
- Speculative or unverified conclusions

### Conversation Memory (context.md)
Save here:
- Decisions made during this conversation
- Findings from investigation (debugger -> developer handoff)
- Context needed by downstream agents in the same conversation chain
- Original intent and requirements clarifications

Do NOT save:
- Permanent knowledge (use shared or agent memory)
- Raw data or large code snippets

### Read-Only Agents

Agents with `disallowedTools: Write, Edit` (architect, reviewer) cannot write to `.scaffolding/agent-memory/` directly. These agents should report findings in their output, and writable agents in the same conversation chain can persist them.

## Format Guidelines

- Max 200 lines per file (auto-injected memory has 200-line limit)
- Use markdown headers to organize by topic
- Include dates `[YYYY-MM-DD]` for time-sensitive entries
- Tag durable facts with `confidence` (high/medium/low) and `last_verified [YYYY-MM-DD]`; re-verify against live code/config before asserting a stale point-in-time fact, and down-grade or remove ones that no longer hold
- Remove outdated entries proactively
- Use concise bullet points, not prose

## Hot/Cold Split

File-based memory (this skill) is the **hot** layer — auto-injected into every agent context under a 200-line budget, so keep it lean: stable, high-level facts and pointers only. Push detailed prose and rarely-needed, fuzzy-discoverable knowledge to the **cold** layer (vector store) via the `semantic-memory-store` skill — it only surfaces on similarity match and carries no per-turn token cost. Durable source-of-truth facts still get a file here; the cold copy is for natural-language recall.

**Local-only carve-out:** secrets and memory/MCP recovery procedures NEVER go to the cold vector store. Recovery info must stay readable when the store itself is down (a 401 means you cannot query the store to learn how to fix it), and secrets must not be embedded in a remote/shared backend. Keep these as file memory only.

## File Creation

If memory files don't exist, create them with the appropriate header:

```markdown
# Shared Knowledge
<!-- Cross-agent project knowledge. Max 200 lines. -->
```

```markdown
# {Agent Name} Memory
<!-- Agent-specific patterns and lessons. Max 200 lines. -->
```

```markdown
# Conversation {conversation_id} Context
<!-- Decisions and findings for this conversation chain. -->
```

## Conversation Recall

Conversation memory is always available via file-based recall. When a task runs with a `conversation_id`, the system reads `context.md` and injects it into the agent's context. No database setup is required for conversation-tier memory.

## Learning Loop

The `/learn` command closes the loop between a finished conversation and the
memory tiers above. It distills one conversation into knowledge candidates (via
the `distill` skill's Conversation-Scoped Distillation mode) and routes each
candidate back into this memory system.

### Candidate ingestion into the 3 tiers

| Candidate kind | Target tier | File |
|----------------|-------------|------|
| Cross-cutting project fact | Shared | `.scaffolding/agent-memory/shared/KNOWLEDGE.md` |
| Domain-specific pattern or lesson | Agent | `.scaffolding/agent-memory/agents/{name}/MEMORY.md` |
| Decision relevant only to the active chain | Conversation | `.scaffolding/conversations/{id}/agent-memory/context.md` |

Ingestion is **propose-then-confirm**: `/learn` prints the proposed memory diff
and applies it only on explicit confirmation. Writes respect the 200-line
`KNOWLEDGE.md` limit — overflow routes to the most relevant agent file per the
`distill` overflow rule. Applied entries become auto-injected context on the next
task.

### Escalation to /create-skill

If a candidate is a **repeatable procedure** rather than a situational fact (per
`distill`'s Skill Promotion Criterion), it is not written to memory. Instead
`/learn` proposes a `/create-skill` invocation with a pre-filled draft, escalating
the knowledge into a first-class auto-invokable skill. Memory holds facts; skills
hold reusable how-to procedures.
