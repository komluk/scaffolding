---
name: quality-validation
description: "Score ResearchPacks (>=80) and Implementation Plans (>=85) against quality gates. TRIGGER when: gating research or a plan before implementation. SKIP: writing or running tests (use testing-strategy); security threat review (use security-review-checklists)."
---

# Quality Validation Skill

Systematic validation ensuring ResearchPacks and Implementation Plans meet quality standards before implementation.

## Auto-Invoke Triggers

- ResearchPack completion requires validation
- Implementation Plan requires validation before coding
- User requests quality check
- Proceeding to next workflow phase (quality gate)

## Quality Gates

### Gate 1: Research → Planning
- **Trigger**: ResearchPack completion
- **Pass**: Score ≥ 80
- **Fail**: Block, return defects

### Gate 2: Planning → Implementation
- **Trigger**: Implementation Plan completion
- **Pass**: Score ≥ 85 AND APIs match
- **Fail**: Block, return defects

### Gate 3: Implementation → Completion
- **Trigger**: Code complete
- **Pass**: `npm run validate` passes
- **Fail**: Trigger self-correction (max 3 attempts)

## ResearchPack Validation (100 pts, pass: 80)

### Completeness (40 pts)
- Library/API with version: 10 pts
- 3+ key APIs documented: 10 pts
- Setup/configuration steps: 10 pts
- 1+ complete code examples: 10 pts

### Accuracy (30 pts)
- API signatures match official docs: 15 pts
- Version numbers correct: 5 pts
- All URLs valid, official sources: 10 pts

### Citation (20 pts)
- Every API has source URL: 10 pts
- Version/section references: 5 pts
- Confidence level stated: 5 pts

### Actionability (10 pts)
- Implementation checklist: 5 pts
- Open questions identified: 5 pts

## Implementation Plan Validation (100 pts, pass: 85)

### Completeness (35 pts)
- All file changes listed: 10 pts
- Step-by-step sequence: 10 pts
- Verification per step: 10 pts
- Test plan included: 5 pts

### Safety (30 pts)
- Rollback plan complete: 15 pts
- Risk assessment (3+ risks): 10 pts
- Minimal changes: 5 pts

### Clarity (20 pts)
- Actionable steps: 10 pts
- Success criteria defined: 5 pts
- Time estimates: 5 pts

### Alignment (15 pts)
- Plan matches ResearchPack: 10 pts
- Addresses all requirements: 5 pts

## Frontend Validation Commands

```bash
# TypeScript type checking
npm run type-check

# ESLint validation
npm run lint

# Production build
npm run build

# Full validation
npm run validate
```

## Common Failures

| Failure | Description |
|---------|-------------|
| Hallucinated APIs | APIs not in official docs |
| Version mismatch | Wrong version in research |
| Missing citations | No source URLs |
| No rollback plan | Missing reversion procedure |
| Ambiguous steps | Non-actionable instructions |
| API misalignment | Plan uses undocumented APIs |

## Validation Output Format

```markdown
## Validation Report

**Artifact**: [ResearchPack|ImplementationPlan]
**Score**: XX/100
**Result**: [PASS|FAIL]

### Scoring Breakdown
- Completeness: XX/40
- Accuracy: XX/30
- Citation: XX/20
- Actionability: XX/10

### Defects Found
1. [Defect description]
2. [Defect description]

### Recommendations
- [Fix suggestion]
```
