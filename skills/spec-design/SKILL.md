---
name: spec-design
description: "How to write OpenSpec design.md and tasks.md artifacts"
---

# OpenSpec Design & Tasks Writing

Guide for creating `design.md` (WHAT + HOW) and `tasks.md` (implementation checklist).

## Prerequisite

Read `{specs_path}/proposal.md` first. Reference its capabilities and impact sections.

**Path Enforcement**: The `specs_path` MUST be `.scaffolding/conversations/{UUID}/specs/` where `{UUID}` is a valid UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use descriptive folder names.

## design.md

### Output Path

Write to: `{specs_path}/design.md`

### Required Sections

| Section | Purpose | Format |
|---------|---------|--------|
| **Context** | Background, current state, constraints | Prose |
| **Goals / Non-Goals** | Scope boundaries | Bullet lists |
| **Specifications** | Requirements + scenarios | GIVEN/WHEN/THEN |
| **Decisions** | Technical choices + rationale | Decision: Why X over Y |
| **Risks / Trade-offs** | Known limitations | [Risk] -> Mitigation |
| **Migration Plan** | Deploy + rollback steps | Checklist (if applicable) |
| **Open Questions** | Unresolved items | Numbered list |

### Specification Format

```markdown
### Requirement: user-session-timeout

The system SHALL terminate idle sessions after 30 minutes.

#### Scenario: session expires after inactivity

- **GIVEN** a user has an active session
- **WHEN** no activity occurs for 30 minutes
- **THEN** the session is invalidated and user is redirected to login
```

Rules:
- Use SHALL/MUST for normative requirements (avoid should/may)
- Every requirement MUST have at least one scenario
- Each scenario is a potential test case
- Map capabilities from proposal.md to requirement groups

### Decision Format

```markdown
## Decisions

### Use Redis for session storage
**Alternatives**: PostgreSQL, in-memory
**Rationale**: Sub-millisecond lookups, built-in TTL, already in stack
```

### Scaffolding Constraints

Include in all designs:
- Max 200 lines per Edit operation
- Files must stay under 500 lines
- Backend validation: `pytest`; Frontend: `npm run validate`
- Map steps to specific workflow chain agents

## tasks.md

### Output Path

Write to: `{specs_path}/tasks.md`

### Format Rules

| Rule | Detail |
|------|--------|
| Group by `## N. Group Name` | Numbered headings |
| Checkbox per task | `- [ ] N.M Task description` |
| Dependency order | Tasks ordered by what must come first |
| File paths | Include target file path in task |
| Acceptance criteria | Each task independently verifiable |
| Validation step | Include `pytest` / `npm run validate` per group |
| Size | Each task completable in one session |

### Template

```markdown
## 1. Setup
- [ ] 1.1 Create `__CLAUDE_HOME_BACKEND_EXAMPLE_PATH__` module structure
- [ ] 1.2 Add dependencies to `requirements.txt`

## 2. Core Implementation
- [ ] 2.1 Implement service in `__CLAUDE_HOME_BACKEND_EXAMPLE_PATH__/service.py`
- [ ] 2.2 Add Pydantic schemas in `__CLAUDE_HOME_BACKEND_EXAMPLE_PATH__/schemas.py`
- [ ] 2.3 Add router in `__CLAUDE_HOME_BACKEND_EXAMPLE_PATH__/router.py`
- [ ] 2.4 Run validation: `__CLAUDE_HOME_TEST_BACKEND_CMD__`

## 3. Frontend + Tests
- [ ] 3.1 Add types to `app/frontend/src/types/index.ts`
- [ ] 3.2 Create component, add unit + integration tests
- [ ] 3.3 Run validation: `npm run validate && pytest`
```

## Quality Checklist

- [ ] design.md references proposal.md capabilities
- [ ] Every requirement has GIVEN/WHEN/THEN scenarios
- [ ] Decisions include alternatives considered
- [ ] Risks have specific mitigations
- [ ] tasks.md uses checkbox format (`- [ ]`)
- [ ] Tasks ordered by dependency
- [ ] Each group has a validation step
- [ ] File paths included in task descriptions