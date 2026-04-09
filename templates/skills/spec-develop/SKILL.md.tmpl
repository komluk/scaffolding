---
name: spec-develop
description: "How to execute OpenSpec tasks.md during implementation"
---

# OpenSpec Apply (Task Execution)

Guide for implementing code changes driven by `tasks.md`.

## Input Files

| File | Purpose | Action |
|------|---------|--------|
| `{specs_path}/tasks.md` | Implementation checklist | Read, execute, mark done |
| `{specs_path}/design.md` | Architecture decisions | Reference during implementation |
| `{specs_path}/proposal.md` | Context and motivation | Reference if unclear on intent |

**Path Enforcement**: The `specs_path` MUST be `.scaffolding/conversations/{UUID}/specs/` where `{UUID}` is a valid UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use descriptive folder names.

## Execution Protocol

### Step 1: Read tasks.md

Parse all task groups and checkboxes. Identify dependency order.

### Step 2: Execute tasks in order

For each task (`- [ ] N.M description`):

1. Read the task description and target file path
2. Check design.md for relevant requirements and decisions
3. Implement the change following project patterns
4. Mark complete: change `- [ ]` to `- [x]`

### Step 3: Run validation after each group

| Stack | Validation Command |
|-------|--------------------|
| Backend | `__CLAUDE_HOME_TEST_BACKEND_CMD__` |
| Frontend | `npm run validate` |
| Both | Run both commands |

### Step 4: Handle blockers

If a task cannot be completed:

```markdown
- [ ] 2.3 Implement caching layer
  > BLOCKED: Redis connection config not yet available. Depends on devops setup.
```

Continue with unblocked tasks. Do not stop the entire chain.

## Rules

| Rule | Detail |
|------|--------|
| Execute in order | Respect dependency sequence |
| Mark progress | `- [ ]` -> `- [x]` as you complete |
| Reference design | Check design.md before implementing |
| Never modify specs | Only modify tasks.md checkboxes, never change spec content |
| Validate per group | Run tests after each task group |
| Note blockers | Add `> BLOCKED:` note, skip and continue |
| Search before write | Check `core/utils/`, `core/exceptions.py` before creating helpers |

## Progress Tracking

### Checkpoint format in tasks.md

```markdown
## 2. Core Implementation

- [x] 2.1 Implement service in `__CLAUDE_HOME_BACKEND_EXAMPLE_PATH__/service.py`
- [x] 2.2 Add Pydantic schemas in `__CLAUDE_HOME_BACKEND_EXAMPLE_PATH__/schemas.py`
- [ ] 2.3 Add router in `__CLAUDE_HOME_BACKEND_EXAMPLE_PATH__/router.py`
  > BLOCKED: Waiting for auth middleware decision
- [x] 2.4 Run validation: `__CLAUDE_HOME_TEST_BACKEND_CMD__`
```

### Resuming after interruption

If tasks.md has some `[x]` items already:
1. Skip completed tasks
2. Resume from first unchecked `- [ ]`
3. Re-read design.md for context on remaining work

## Integration with Design Decisions

When design.md specifies a technical choice, follow it:

| Design says | You do |
|-------------|--------|
| "Use Repository pattern" | Create repository class, not inline queries |
| "Use Pydantic v2 model_validator" | Use `@model_validator`, not `@validator` |
| "Max 500 lines per file" | Split if approaching limit |
| "Existing utility in core/utils" | Import it, do not recreate |

## Anti-Patterns

| Avoid | Instead |
|-------|---------|
| Skipping validation steps | Run tests after every group |
| Modifying design.md content | Only reviewer or planner changes specs |
| Implementing out of order | Follow dependency sequence |
| Ignoring blocked tasks silently | Add explicit `> BLOCKED:` note |
| Creating duplicate utilities | Search `core/` first |