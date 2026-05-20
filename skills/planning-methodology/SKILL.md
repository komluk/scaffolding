---
name: planning-methodology
description: "Build minimal, reversible implementation plans. TRIGGER when: turning research into a plan, or sequencing work before writing code. SKIP: gathering documentation (use research-methodology); writing OpenSpec design.md/tasks.md (use spec-design)."
---

# Planning Methodology Skill

Systematic approach for creating minimal, reversible implementation plans after research phase.

## Auto-Invoke Triggers

- After ResearchPack is validated (score >= 80)
- Before code implementation begins
- When task requires multi-file changes
- User requests implementation plan

## 5-Step Methodology

### Step 1: ResearchPack Review (30 sec)
- Verify ResearchPack score >= 80
- Extract required APIs and methods
- Note all gotchas and caveats
- List open questions

### Step 2: Codebase Analysis (60 sec)
- Find existing patterns to follow
- Identify files to modify
- Check for similar implementations
- Map component dependencies

### Step 3: Change Mapping (60 sec)
- List all files to modify/create
- Define minimal change set
- Identify dependencies between changes
- Plan test coverage

### Step 4: Risk Assessment (30 sec)
- Identify potential failure points
- Assess impact on existing code
- Define rollback per change
- Flag breaking changes

### Step 5: Plan Documentation (60 sec)
- Write structured ImplementationPlan
- Include verification per step
- Document rollback procedure
- Define success criteria

## Output Format: ImplementationPlan

```markdown
## ImplementationPlan: [Feature]

### Scope
- Files to modify: X
- New files: Y
- Tests to add: Z

### Changes

| # | File | Action | Verification |
|---|------|--------|--------------|
| 1 | path/file.ts | MODIFY | type-check |
| 2 | path/new.ts | CREATE | builds |

### Steps
1. [Step with verification]
2. [Step with verification]

### Rollback
[How to revert each change]

### Success Criteria
- [ ] npm run validate passes
- [ ] Feature works as specified
```

## Planning Principles

### Minimal Changes
- Only modify what's necessary
- No "while we're here" improvements
- Prefer small, focused changes

### Reversibility
- Every change must be revertable
- Document rollback per step
- Keep backup strategy clear

### Consistency
- Follow existing patterns
- Match naming conventions
- Use established architecture

## Quality Gate

Plan must score >= 85:

| Criterion | Points |
|-----------|--------|
| All files listed | 15 |
| Step-by-step sequence | 15 |
| Verification per step | 15 |
| Rollback complete | 15 |
| APIs match research | 15 |
| Risk assessment | 10 |
| Test plan | 10 |
| Success criteria | 5 |
