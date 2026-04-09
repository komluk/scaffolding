---
name: git-operations
description: "Git command patterns, branching strategies, and safety protocols. Use for branch management, conflict resolution, or worktree operations."
---

# Git Operations Skill

## Purpose
Core git command patterns, branching strategies, and safety protocols for a project.

## Branching Convention

| Branch Pattern | Purpose |
|----------------|---------|
| `main` | Production branch, always stable |
| `scaffolding/{task_id[:12]}` | Worktree task branches (auto-created) |
| `backup/{task_id[:12]}` | Safety backup before destructive ops |

## Safe Operation Patterns

### Before Any Destructive Operation
```bash
git status
git stash list
git log --oneline -5
git branch backup/$(date +%s) HEAD
```

### Merge Strategy
```bash
git merge --no-commit --no-ff branch_name
git diff --cached --stat
git merge --continue  # or --abort
```

### Conflict Resolution
```bash
git diff --name-only --diff-filter=U
git checkout --ours path/to/file    # keep ours
git checkout --theirs path/to/file  # keep theirs
```

### Cherry-Pick
```bash
git cherry-pick --no-commit <commit>
git diff --cached --stat
git cherry-pick --continue
```

## Common Error Patterns

| Error | Fix |
|-------|-----|
| `fatal: not a git repository` | Verify path, check .git exists |
| `CONFLICT (content)` | Use conflict resolution protocol |
| `cannot lock ref` | Wait and retry, check stale locks |
| `worktree is not clean` | Stage+commit or stash |

## Push Operations

### Standard Push (after workflow)
```bash
# 1. Verify unpushed commits exist
git log --oneline origin/main..HEAD

# 2. Push to remote
git push origin main

# 3. Verify push succeeded
git log --oneline origin/main..HEAD  # should be empty
```

### Push Safety Rules
- NEVER use `--force` or `--force-with-lease` without explicit user confirmation
- Always verify unpushed commits BEFORE push
- Always verify push success AFTER push
- If push fails due to divergence, report to user -- do NOT auto-rebase

## Finishing Flow

After work is complete on a branch, execute one of these four actions based on context.

### Merge to Main
```bash
git checkout main
git merge --ff-only <branch>  # try fast-forward first
# if ff fails: git merge --no-ff <branch>
git branch -d <branch>
git worktree remove .scaffolding/worktrees/<task_id> 2>/dev/null
git worktree prune
```

### Create PR
```bash
git push -u origin <branch>
gh pr create --title "<title>" --body "<body>"
# keep branch and worktree
```

### Keep Branch
```bash
# no action needed -- branch stays as-is
git push -u origin <branch>  # optional: push to remote for safety
```

### Discard Branch
```bash
git checkout main
git worktree remove .scaffolding/worktrees/<task_id> 2>/dev/null
git branch -D <branch>
git worktree prune
```
