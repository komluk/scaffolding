---
name: context-engineering
description: "Optimize Claude Code context-window usage for accuracy and cost. TRIGGER when: hitting context limits, structuring prompts for an agent, or trimming what gets injected into a task. SKIP: persisting knowledge across sessions (use agent-memory); semantic recall tuning (use semantic-memory-mcp)."
---

# Context Engineering Skill

Optimizes Claude Code context for better performance and accuracy.

## Auto-Invoke Triggers

- Every 50 messages in conversation
- After major refactoring
- When context feels stale
- Task switching
- User requests `/context` command

## Context Principles

### Active Curation
- Keep only relevant information
- Remove completed task details
- Archive outdated patterns
- Focus on current work

### Signal-to-Noise Ratio
| High Signal | Low Signal |
|-------------|------------|
| Current APIs | Old experiments |
| Active patterns | Completed tasks |
| Recent decisions | Historical context |
| Project structure | Implementation details |

### Token Budget
| File | Limit | Purpose |
|------|-------|---------|
| CLAUDE.md | < 2000 tokens | Quick reference |
| Agent docs | < 500 per agent | Role definition |
| Skills | < 300 per skill | Methodology |

## Context Analysis Process

### Step 1: Measure Current State
```markdown
## Context Analysis

### Token Counts
- CLAUDE.md: XXX tokens
- Agent docs: XXX tokens total
- Skills: XXX tokens total
- Total: XXXX tokens

### Staleness Check
- [ ] Last updated: [date]
- [ ] References current project state
- [ ] No deprecated APIs/patterns
```

### Step 2: Identify Issues
```markdown
### Issues Found

#### Stale Content
- Section X: Outdated [reason]
- Section Y: No longer relevant

#### Redundant Content
- Duplicated in files A and B
- Can consolidate X and Y

#### Missing Content
- Current API not documented
- New pattern not captured
```

### Step 3: Optimization Actions
```markdown
### Optimization Plan

1. **Archive**: Move section X to knowledge-core.md
2. **Remove**: Delete duplicate Y
3. **Update**: Refresh API documentation
4. **Add**: Document new pattern Z
```

## CLAUDE.md Structure

Optimal structure for quick reference:

```markdown
# Project Name

[One-line description]

## Quick Reference
| Action | Command |
|--------|---------|
| Run | command |
| Test | command |
| Build | command |

## Agent System
[Link to detailed docs]

## Tech Stack
- Frontend: [stack]
- Backend: [stack]

## Project Structure
[Key directories only]

## Key Rules
1. [Critical rule]
2. [Critical rule]
```

## Optimization Strategies

### Token Reduction
- Use tables instead of prose
- Link to details instead of inline
- Remove examples from main docs
- Keep explanations brief

### Information Hierarchy
1. **Immediate**: In CLAUDE.md
2. **Reference**: In linked docs
3. **Archive**: In knowledge-core.md
4. **Delete**: Truly obsolete

### Import Chain Management
- Max 5 levels of imports
- No circular references
- Clear dependency direction

## Context Health Metrics

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| CLAUDE.md tokens | < 1500 | 1500-2500 | > 2500 |
| Stale sections | 0 | 1-2 | 3+ |
| Redundancy | 0% | < 10% | > 10% |
| Missing critical | 0 | 1 | 2+ |

## Maintenance Schedule

| Trigger | Action |
|---------|--------|
| Every 50 messages | Quick analysis |
| After major change | Update relevant sections |
| Weekly | Full review |
| Task switch | Clear task-specific context |

## Output: Context Report

```markdown
## Context Report

**Date**: [date]
**Health**: Healthy | Warning | Critical

### Metrics
- Total tokens: XXXX
- Stale sections: X
- Redundancy: X%

### Findings
1. [Finding]
2. [Finding]

### Recommendations
1. [Action to take]
2. [Action to take]

### Potential Savings
- Current: XXXX tokens
- After optimization: XXXX tokens
- Savings: XX%
```
