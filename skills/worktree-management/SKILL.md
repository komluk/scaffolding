---
name: worktree-management
description: "Scaffolding worktree lifecycle, diagnostics, and recovery. TRIGGER when: debugging worktree isolation, recovering a stuck worktree, or managing task isolation. SKIP: ordinary branch/commit/merge operations (use git-operations)."
---

# Worktree Management Skill

## Purpose
Scaffolding.tool-specific worktree lifecycle management, diagnostics, and recovery procedures.

## CRITICAL: Only gitops Touches Git

Other agents (developer, architect) do NOT commit. The worktree flow is:
1. Agent writes code/tests in worktree
2. **gitops** commits, merges to main, pushes, cleans up

If a worktree has no new commits after an agent finishes, the changes are uncommitted — gitops must commit them BEFORE merge.

## Worktree Lifecycle

```
create_worktree() --> agent executes (no commit) --> gitops: commit
    --> gitops: merge_to_main() --> gitops: push --> gitops: cleanup
```

### States (WorktreeStatus enum)
| Status | Meaning |
|--------|---------|
| `ready` | Created, waiting for task execution |
| `merging` | Merge in progress |
| `merged` | Successfully merged to main |
| `conflict` | Merge conflict detected |
| `cleanup` | Being removed |
| `removed` | Fully cleaned up |

## File Locations

| Resource | Path |
|----------|------|
| Worktrees directory | `.scaffolding/worktrees/` |
| Worktree metadata | `.scaffolding/worktrees/{task_id[:12]}/worktree.json` |
| Branch naming | `scaffolding/{task_id[:12]}` |

## Diagnostics

### List All Worktrees
```bash
git worktree list
ls -la .scaffolding/worktrees/
```

### Find Uncommitted Changes
```bash
for d in .scaffolding/worktrees/*/; do
  changes=$(cd "$d" && git status --porcelain 2>/dev/null | wc -l)
  if [ "$changes" -gt 0 ]; then
    echo "UNCOMMITTED: $d ($changes files)"
  fi
done
```

## Recovery Procedures

### Force Remove Corrupt Worktree
```bash
git worktree remove --force .scaffolding/worktrees/{task_id[:12]}
git branch -D scaffolding/{task_id[:12]}
rm -rf .scaffolding/worktrees/{task_id[:12]}
git worktree prune
```

### Recover Uncommitted Work
```bash
cd .scaffolding/worktrees/{task_id[:12]}
git add -A && git stash
cd /project/root && git stash pop
```

## Post-Finish Cleanup

After a merge or discard finishing action, clean up the worktree:

```bash
git worktree remove .scaffolding/worktrees/{task_id[:12]} 2>/dev/null
rm -rf .scaffolding/worktrees/{task_id[:12]}
git worktree prune
```

Note: Only needed for **merge** and **discard** actions. PR and keep actions leave the worktree intact.
