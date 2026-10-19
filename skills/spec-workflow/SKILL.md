---
name: spec-workflow
description: "OpenSpec lifecycle orchestration for /workflow chains. TRIGGER when: coordinating the analyst-architect-developer-reviewer chain or managing spec status transitions. SKIP: writing an individual spec artifact (use spec-research, spec-design, or spec-review)."
---

# OpenSpec Workflow Orchestration

Spec-driven development protocol for coordinating multi-agent workflows.

## UUID Enforcement

**CRITICAL**: The `conversation_id` MUST always be a UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use descriptive names, slugs, or human-readable strings. If no UUID is available, generate one with `uuidgen` or `python3 -c "import uuid; print(uuid.uuid4())"`. Self-check: does the conversation_id match the pattern `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`? If not, STOP and use a real UUID.

## Directory Structure

Canonical layout (identical on every machine and in every project):

```
<repo>/.scaffolding/
  conversations -> <share>/projects/<repo-name>/conversations   (symlink to the NFS share)
  worktrees/                      LOCAL real dir, never on NFS
  openspec/  workflows/           git-tracked
  agent-memory/  project-id  ...  local

<share>/projects/<repo-name>/conversations/{conversation_id}/
  context.json                    status + history (merged schema below)
  specs/
    proposal.md   -- WHY + WHAT (analyst)
    design.md     -- WHAT + HOW (architect)
    tasks.md      -- checklist (architect)
  agent-memory/context.md         conversation-tier memory
  attachments/{attId}/{name}      + {attId}.json
  tasks/{taskId}/                 meta.json, output.md, output.jsonl, summary.json, state.json
```

Always read and write through `.scaffolding/conversations/...` (the symlink);
never hardcode the share path. `<share>` differs per machine
(`/mnt/scaffolding-data` or `/mnt/scaffolding`). `nfs-sync.sh` creates the link
at SessionStart or via `nfs-sync.sh link <dir>`; `<share>/platform/conversations`
holds notes only and is never a link target.

## Status Lifecycle

Tracked in `status` of `.scaffolding/conversations/{conversation_id}/context.json`:

| Status | Meaning | Transition |
|--------|---------|------------|
| `exploring` | Research phase | -> `drafting` when proposal done |
| `drafting` | Design + tasks | -> `implementing` when tasks done |
| `implementing` | Code changes | -> `reviewing` when tasks complete |
| `reviewing` | Verification | -> `complete` when verified |
| `complete` | Done | -> `archived` on request |
| `archived` | Historical | Terminal state |

## Agent Routing in /workflow

| Phase | Agent | Reads | Writes | Gate |
|-------|-------|-------|--------|------|
| 1. Analyze | analyst | requirements | `proposal.md` | proposal written |
| 1b. Research (conditional) | researcher | requirements | ResearchPack | score >= 80 |
| 2. Design | architect | `proposal.md` | `design.md`, `tasks.md` | score >= 85 |
| 3. Apply | developer | `tasks.md`, `design.md` | source code | validation passes |
| 4. Verify | reviewer | `design.md`, `tasks.md` | review report | no criticals |

## When Researcher Is Needed

Analyst flags need for research in proposal.md. Researcher is invoked ONLY when the task involves:
- New external API integration (e.g., Stripe, Twilio)
- Unfamiliar library not yet in the project
- Best practices requiring current internet research
- Version-specific documentation for upgrades/migrations

Analyst writes proposal directly (no researcher) for:
- Internal codebase refactoring
- UI/styling changes
- Bug fixes with known root cause
- Configuration changes
- Features using only existing project dependencies

## When to Create vs Skip Specs

| Task Type | Use Specs? | Reason |
|-----------|-----------|--------|
| New feature | Yes | Needs design, multi-file |
| Architecture change | Yes | Needs decisions documented |
| Multi-agent workflow | Yes | Needs coordination |
| Bug fix (simple) | No | Direct to developer |
| Typo / config tweak | No | Direct to developer |
| Single-file refactor | No | Direct to developer |

## Orchestration Steps

1. **Obtain conversation_id UUID**: From prompt context or generate via `uuidgen`. **MUST be a UUID, never a descriptive name** (validate against the regex above before creating any directory).
2. **Create specs directory**: `mkdir -p .scaffolding/conversations/{conversation_id}/specs/`
3. **Set specs_path**: `.scaffolding/conversations/{conversation_id}/specs/`
4. **Analyst writes proposal.md** (requirements, scope, impact, feasibility)
5. **If research needed**: analyst flags in proposal.md, researcher is invoked (score >= 80)
6. **Architect writes design.md + tasks.md** (incorporating proposal.md and ResearchPack if available)
7. **Pass specs_path** in every agent delegation prompt
8. **Update context.json** status after each phase transition (read-merge-write, see schema)
9. **Gate enforcement**: Block next phase if quality gate fails

## Context JSON Schema

One merged schema shared with the platform. **Every field is optional**; readers
treat a missing key as empty.

```jsonc
{
  "conversation_id": "uuid",                  // always a UUID
  // plugin (this workflow)
  "status": "exploring|drafting|implementing|reviewing|complete|archived",
  "description": "string",
  "created_at": "ISO-8601 string",
  "agents_involved": ["architect", "developer"],
  // platform
  "original_intent": "string",
  "task_history": [ { "task_id": "..." } ],
  "cumulative_files_changed": ["path"],
  "cumulative_decisions": ["string"],
  "last_updated": 1760000000,                 // epoch seconds (number)
  "openspec": { "status": "archived" }        // or null
}
```

**Read-merge-write, always.** Read the existing file, change only the keys you
own, write the whole object back. Never recreate the file from scratch and never
drop keys you do not know (e.g. keep `original_intent` and `task_history` when
setting `status`). Keep existing types: `created_at` is an ISO string,
`last_updated` a number. There is no version field. When the file does not
exist yet, create it with `conversation_id` plus the keys you own.

Minimal merge (jq):

```bash
f=".scaffolding/conversations/$CONV_ID/context.json"
[ -f "$f" ] || echo "{\"conversation_id\": \"$CONV_ID\"}" > "$f"
jq '.status = "implementing"' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
```

## Schema Reference

Custom schema: `.scaffolding/openspec/schemas/scaffolding-workflow/schema.yaml`
Config: `.scaffolding/openspec/config.yaml`
Templates: `.scaffolding/openspec/schemas/scaffolding-workflow/templates/`