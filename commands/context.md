---
name: context
description: Analyze and optimize Claude Code's context configuration (analyze, optimize, or reset).
---

# /context Command

Analyze and optimize Claude Code's context configuration.

## Usage

```
/context [analyze|optimize|reset]
```

## Modes

### analyze (default)
Reviews context files and reports optimization opportunities without making changes.

**Checks**:
- Token count in CLAUDE.md
- Stale or outdated information
- Redundant/duplicated content
- Import chain depth
- Knowledge-core.md size

**Output**:
```
Context Analysis Report
=======================
Total tokens: XXXX
Stale content: X sections
Redundant: X items
Potential savings: XX%

Recommendations:
1. Archive section X to knowledge-core.md
2. Remove duplicate Y
3. Consolidate imports Z
```

### optimize
Automatically applies optimizations:
- Archives outdated content
- Removes duplicates
- Consolidates sections
- Updates imports

**Safety**: Creates backup before changes

### reset
Restores template files and clears customizations.

**Use for**: Starting fresh projects

**Warning**: Requires confirmation

## When to Run

| Trigger | Command |
|---------|---------|
| Every 50 messages | `/context analyze` |
| After major refactoring | `/context analyze` |
| When analysis shows 15%+ savings | `/context optimize` |
| Task switching | `/context optimize` |
| New project | `/context reset` |

## Context Engineering Principles

### Active Curation
- Remove information not needed for current task
- Archive completed feature docs
- Keep only active patterns

### Signal-to-Noise
- High value: Current APIs, active patterns
- Low value: Old experiments, completed tasks

### Token Budget
- CLAUDE.md: < 2000 tokens
- knowledge-core.md: Archive storage
- Imports: Max 5 hops

## Performance Gains

Based on Anthropic research:
- 39% improvement in task completion
- 84% token reduction possible
- Faster response times
- More accurate outputs
