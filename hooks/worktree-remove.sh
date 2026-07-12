#!/usr/bin/env bash
# WorktreeRemove hook.
#
# Contract (verified against the `claude` 2.1.207 binary): stdin is JSON with
# base hook fields plus hook_event_name="WorktreeRemove" and
# worktree_path=<path>. The hook must perform the actual removal itself;
# exit 0 = removal succeeded (or was already gone). No stdout is parsed.
#
# Only cleans up worktrees registered by worktree-create.sh's in-repo branch
# (git worktree add under .claude/worktrees). A fallback in-place path
# (returned as plain $cwd when cwd wasn't a git repo) is never a registered
# git worktree, so the exact-match check below is a no-op for it and it is
# left untouched, per Option A.
set -euo pipefail

INPUT="$(cat)"
WORKTREE_PATH="$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('worktree_path',''))" 2>/dev/null || true)"

if [ -z "$WORKTREE_PATH" ] || [ ! -e "$WORKTREE_PATH" ]; then
  exit 0
fi

REPO_ROOT="$(git -C "$WORKTREE_PATH" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

# Exact-match against the registry (agent-comms §2 convention) — never a
# substring grep, which would let /foo/bar-evil match /foo/bar.
FOUND=0
while IFS= read -r line; do
  case "$line" in
    "worktree "*)
      wp="${line#worktree }"
      if [ "$wp" = "$WORKTREE_PATH" ]; then
        FOUND=1
      fi
      ;;
  esac
done < <(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null)

if [ "$FOUND" != "1" ]; then
  exit 0
fi

git -C "$REPO_ROOT" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || rm -rf "$WORKTREE_PATH"
git -C "$REPO_ROOT" worktree prune 2>/dev/null || true
exit 0
