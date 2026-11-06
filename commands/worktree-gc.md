---
name: worktree-gc
description: Remove git worktrees (and local branches) whose work is already merged into the default branch, including squash merges. Dry run by default.
---

# /worktree-gc Command

Garbage-collect stale git worktrees of the current repo. Detects fast-forward, cherry-picked
and squash merges (remote ref gone + commit subjects in `origin/<default>`).

## Usage

```
/worktree-gc                      # dry run: table of REMOVE/KEEP + reason + path
/worktree-gc --apply              # remove the REMOVE ones (+ local branches, prune)
/worktree-gc --all-repos ~/repos  # scan every git repo directly under the dir
```

## Run

Pass `$ARGUMENTS` through. Show the table to the user. Run with `--apply` only when the
user asked for it (or confirms after the dry run).

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-gc.sh" $ARGUMENTS
```

## Rules

- REMOVE only if there are no uncommitted tracked changes AND the work is in `origin/<default>`.
- Unsure -> KEEP. The main checkout is never touched. Remote branches are never deleted.
- Runs `git fetch --prune` first (warns and continues on failure).
