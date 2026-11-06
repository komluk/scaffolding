---
name: worktree-management
description: "Scaffolding worktree lifecycle, diagnostics, and recovery. TRIGGER when: debugging worktree isolation, recovering a stuck worktree, or managing task isolation. SKIP: ordinary branch/commit/merge operations (use git-operations)."
---

# Worktree Management Skill

## Purpose
Scaffolding.tool-specific worktree lifecycle management, diagnostics, and recovery procedures.

Live worktrees:
!`git worktree list 2>/dev/null || true`

## CRITICAL: Only gitops Touches Git

Other agents (developer, architect) do NOT commit. The worktree flow is:
1. Agent writes code/tests in worktree
2. **gitops** commits, merges to main, pushes, **cleans up (MANDATORY)**

If a worktree has no new commits after an agent finishes, the changes are uncommitted — gitops must commit them BEFORE merge.

## Parallel Teammates: Isolation + Serialized Merge

When Agent Teams is enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, see
`docs/agent-teams.md`), multiple writer teammates may run concurrently. The
worktree model makes this safe ONLY if both hold:

- **Per-teammate isolation:** every writer gets its OWN worktree
  `.scaffolding/worktrees/{task_id[:12]}` AND its OWN unique `SCAFFOLDING_TASK_ID`.
  No two writers share a working tree or a `/tmp/scaffolding-mtime-${TASK_ID}.json`
  staleness store — sharing would trip `file-staleness-check.sh` between them and
  produce unattributable interleaved changes.
- **Serialized merge:** gitops remains the SOLE committer and merges worktree
  branches to main ONE AT A TIME through the `merging`→`merged` states below.
  Parallel work is allowed; parallel committing/merging is not — only one merge
  is ever in flight.

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
| Worktrees directory | `.scaffolding/worktrees/` (local real dir, **never on NFS**) |
| Task worktree | `.scaffolding/worktrees/{task_id[:12]}/` — branch `scaffolding/{task_id[:12]}` |
| Worktree metadata | `.scaffolding/worktrees/{task_id[:12]}/worktree.json` |
| Thread worktree | `.scaffolding/worktrees/threads/{id8}/` |
| Named worktree | `.scaffolding/worktrees/<name>/` — plugin `WorktreeCreate` hook, branch `worktree-<name>` (`/` in the name becomes `+`) |

`.claude/worktrees/` is no longer used.

### Conversations inside a worktree

Inside a worktree, `.scaffolding/conversations` is a symlink to the same share
target as the main checkout (`readlink -f` of the main link). A spec written from
a worktree therefore lands on the share and survives worktree removal. The
`WorktreeCreate` hook creates this link; the `WorktreeRemove` hook deletes only
the link, never the target. Do not copy conversation files into a worktree, and
do not `rm -rf` through the link.

The `WorktreeRemove` hook only removes registered worktrees under the main
checkout's `.scaffolding/worktrees/`. Dirs without `worktree.json` are not
platform-made; the platform sweep must leave them alone.

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

## Post-Finish Cleanup (MANDATORY after every merge or discard)

Cleanup is the final step of every merge, for ANY worktree gitops worked in (`.scaffolding/worktrees/...`, `~/.cache/worktrees/...`, anywhere). Do it for squash-merged PRs too.

```bash
# from the main checkout, never from inside the worktree
git -C <worktree> status --porcelain --untracked-files=no   # must be empty
git worktree remove <worktree>     # --force only for untracked build output (node_modules)
git branch -D <branch>
git worktree prune
```

- Uncommitted tracked changes -> REFUSE, keep worktree + branch, report the files.
- Report the cleanup in the final report.
- Never delete remote branches here.

Note: Only **merge** and **discard** clean up. PR-open and keep actions leave the worktree intact (clean up after the PR is merged).

### Sweeping stale worktrees: `/worktree-gc`

`WorktreeRemove` only sees worktrees made by `worktree-create.sh`. Plain `git worktree add` ones (e.g. `~/.cache/worktrees/<name>`) and squash-merged branches are caught by `scripts/worktree-gc.sh`:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-gc.sh"                      # dry run
bash "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-gc.sh" --apply              # remove
bash "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-gc.sh" --all-repos ~/repos  # every repo under a dir
```

REMOVE only if no uncommitted tracked changes AND the work is in `origin/<default>` (no commits ahead, patch-equivalent, or squash-merged: remote ref gone + commit subjects in `origin/<default>`). Unsure -> KEEP.
