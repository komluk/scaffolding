---
name: memory
description: "Unified memory CRUD: write/update/delete/query file-based markdown entries and sync to MCP semantic store. TRIGGER when: saving a new memory entry, updating or deleting an existing entry, querying stored memories, or deduplicating before write. SKIP: 3-tier agent memory (use agent-memory); in-task vector recall (use semantic-memory-mcp)."
---

# Memory Skill

## Purpose

Unified CRUD operations over the scaffolding memory system. Handles file-based
markdown entries under `~/.claude/projects/.../memory/` and synchronises every
write/delete with the MCP semantic vector store when available.

Use this skill when an explicit memory management action is requested: save a
new entry, update or delete an existing one, query/search stored entries, or
rebuild the `MEMORY.md` index.

---

## Memory Types

| Type | File prefix | Use for |
|------|-------------|---------|
| `user` | `user_*.md` | Personal preferences, identity, recurring instructions |
| `feedback` | `feedback_*.md` | Corrections, tone/style adjustments, behavioural feedback |
| `project` | `project_*.md` | Stack details, environment facts, team conventions |
| `reference` | `reference_*.md` | External resources, URLs, credentials pointers |

---

## File Layout

```
~/.claude/projects/{project-slug}/memory/
├── MEMORY.md           ← index (one bullet per entry)
├── user_*.md           ← user-type entries
├── feedback_*.md       ← feedback-type entries
├── project_*.md        ← project-type entries
└── reference_*.md      ← reference-type entries
```

The project slug is the filesystem-safe version of the working directory path
(hyphens replacing `/`, e.g. `-home-komluk-repos`).

---

## Entry File Format

Every entry file MUST begin with YAML frontmatter followed by the body:

```markdown
---
name: <kebab-case-slug>
description: "<one-line summary>"
metadata:
  node_type: memory
  type: <user|feedback|project|reference>
  originSessionId: <session-uuid-or-unknown>
---

<Body content — concise markdown. Max ~40 lines per file.>

**Why:** <rationale or context>

**How to apply:** <when/how to use this entry>
```

Rules:
- `name` must be kebab-case and equal the file slug (after the prefix).
- `description` is the single line shown in MEMORY.md.
- Body MUST include **Why** and **How to apply** sections.
- Do NOT store secrets, tokens, or passwords.

---

## MEMORY.md Index Format

```markdown
# Memory Index

- [<Title>](<filename>.md) — <one-line description>
```

One bullet per file, alphabetical order within each type group. The title is
the human-readable name; the description matches the frontmatter `description`.

---

## Operations

### WRITE (new entry)

1. **Deduplicate first** — scan existing `*.md` files in the memory dir for
   entries with the same `name` or near-identical `description`. If a match
   exists, perform UPDATE instead of creating a new file.
2. Determine the `type` and derive the file slug from the entry name:
   `<type>_<slug>.md` (e.g. `feedback_pve-env-confusion.md`).
3. Create the file with the frontmatter + body template above.
4. Append a bullet to `MEMORY.md` (create the index if absent).
5. If MCP semantic memory is available, call:
   ```
   mcp__semantic-memory__semantic_store(
     content="<description + key facts from body, ≤500 chars>",
     agent_name="memory",
     content_type="learning",
     tags=["<type>", "<slug>", ...],
     project_id="scaffold:831a4a3fd343b902"
   )
   ```
   Do NOT store secrets or file-system paths in the vector store.

### UPDATE (existing entry)

1. Identify the target file by name/slug or MEMORY.md lookup.
2. Read the file, apply the change to frontmatter or body.
3. Overwrite the file (preserve frontmatter structure).
4. Update the bullet in `MEMORY.md` if the description changed.
5. If MCP available, re-store with updated content (the backend deduplicates
   by content hash and merges tags/timestamp).

### DELETE (remove entry)

1. Delete the `.md` file.
2. Remove the corresponding bullet from `MEMORY.md`.
3. MCP semantic store does not expose a delete API — leave the vector entry
   (it will decay naturally and will not surface unless re-queried with high
   similarity).

### QUERY (search/recall)

**File-based query:**
- Scan `MEMORY.md` for keyword match in title or description.
- Read matching files and return their body content.

**Semantic query (if MCP available):**
```
mcp__semantic-memory__semantic_search(
  query="<natural-language query>",
  project_id="scaffold:831a4a3fd343b902"
)
```
or
```
mcp__semantic-memory__semantic_recall(
  context="<task context summary>",
  project_id="scaffold:831a4a3fd343b902"
)
```
Return both file-based and semantic results, deduplicating overlaps.

---

## Deduplication Rules

Before every WRITE check:

| Check | Method | Action on match |
|-------|--------|-----------------|
| Exact `name` match | frontmatter `name` field | UPDATE existing |
| Near-identical description | string similarity > 80 % | UPDATE existing |
| Same slug | filename match | UPDATE existing |
| Semantic duplicate | MCP `semantic_search` score > 0.92 | UPDATE existing |

If unsure, prefer UPDATE over creating a duplicate.

---

## MCP Availability

If `mcp__semantic-memory__*` tools are not accessible (MCP server not wired or
returns an error), skip all MCP calls silently. File-based memory is always
sufficient; semantic memory is an optional enhancement layer.

Check by attempting a no-op recall — if it throws, set a local flag
`mcp_available = false` and proceed without MCP for the remainder of the task.

---

## Anti-Patterns

| Avoid | Instead |
|-------|---------|
| Storing secrets or tokens | Note that the secret is in Vault/env; link the location |
| Duplicate files for the same topic | Deduplicate before writing; run UPDATE |
| MEMORY.md out of sync with files | Always update index on every write/delete |
| Oversized entry files (>60 lines) | Split into two entries with distinct slugs |
| Storing raw code snippets | Summarise the insight; keep ≤500 chars for MCP |
| Using generic slugs (`notes`, `info`) | Use descriptive kebab-case slugs |
| Writing to MCP without file write | Always write file first; MCP is the mirror |

---

## Quality Checklist

- [ ] File has valid YAML frontmatter with `name`, `description`, `metadata`
- [ ] `name` in frontmatter equals the slug in the filename
- [ ] Entry has **Why** and **How to apply** sections
- [ ] `MEMORY.md` updated (bullet added, modified, or removed)
- [ ] No secrets, tokens, or passwords in any file or MCP content
- [ ] Deduplication check ran before creating a new file
- [ ] If MCP available: `semantic_store` called with `project_id="scaffold:831a4a3fd343b902"`
- [ ] File is under 60 lines
