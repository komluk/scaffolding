---
name: spec-research
description: "Write OpenSpec proposal.md artifacts (why + what). TRIGGER when: capturing requirements, scope, and impact for a spec-driven feature. SKIP: technical design (use spec-design); external documentation research (use research-methodology)."
---

# OpenSpec Proposal Writing

Guide for creating `proposal.md` -- the WHY document that anchors the entire workflow.

## Output Path

Write to: `{specs_path}/proposal.md`

**Path Enforcement**: The `specs_path` MUST be `.scaffolding/conversations/{UUID}/specs/` where `{UUID}` is a valid UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use descriptive folder names.

## Required Sections

| Section | Purpose | Content |
|---------|---------|---------|
| **Why** | Motivation | 1-2 sentences. What problem? Why now? |
| **What Changes** | Scope | Bullet list. New capabilities, modifications, removals. Mark **BREAKING** |
| **Capabilities** | Contract | New + modified capabilities (kebab-case names) |
| **Impact** | Blast radius | Affected code, APIs, dependencies, systems |
| **Agent Assignment** | Routing | Table of agents, roles, artifacts |
| **Rollback Plan** | Safety | Revert points, manual steps, affected systems |

## Capabilities Section (Critical)

This section creates the contract between proposal and design phases.

### New Capabilities
- Use kebab-case: `user-auth`, `data-export`, `api-rate-limiting`
- Each becomes a requirement group in design.md
- Brief description of what the capability covers

### Modified Capabilities
- Only list if spec-level REQUIREMENTS change (not just implementation)
- Check `.scaffolding/openspec/specs/` for existing names
- Leave empty if no requirement changes

## Quality Checklist

- [ ] Goals are concrete and measurable (not vague)
- [ ] Edge cases identified in Impact section
- [ ] All affected agents listed in Agent Assignment
- [ ] Rollback plan has specific revert steps
- [ ] Capabilities use kebab-case naming
- [ ] No implementation details (those go in design.md)
- [ ] Stakeholder impact addressed

## Template Structure

```markdown
## Why

[1-2 sentences: problem + urgency]

## What Changes

- [Specific change 1]
- [Specific change 2]
- **BREAKING**: [Breaking change, if any]

## Capabilities

### New Capabilities
- `capability-name`: Brief description

### Modified Capabilities
- `existing-name`: What requirement is changing

## Impact

[Affected code, APIs, dependencies, systems]

## Agent Assignment

| Agent | Role | Artifacts |
|-------|------|-----------|
| architect | Analyst + Coordinator | proposal.md, design.md, tasks.md |
| researcher | External Research (if needed) | ResearchPack |
| developer | Developer | Source code |
| reviewer | Reviewer | Review report |

## Rollback Plan

- [ ] Identify revert points
- [ ] Document manual rollback steps
- [ ] List affected systems
```

## Anti-Patterns

| Avoid | Instead |
|-------|---------|
| Vague goals ("improve performance") | Measurable goals ("reduce p95 latency below 200ms") |
| Implementation details | Save for design.md |
| Missing rollback plan | Always include revert strategy |
| Skipping capabilities section | This is the design contract |