#!/usr/bin/env bash
# WorktreeCreate hook.
#
# Contract (verified against the `claude` 2.1.207 binary — no public docs
# exist for this event yet): stdin is JSON with base hook fields (session_id,
# cwd, ...) plus hook_event_name="WorktreeCreate" and name=<worktree name>.
# Output is PLAIN TEXT, NOT JSON: create the directory, then echo its
# absolute path as the LAST non-empty stdout line. Claude Code stats that
# path afterwards and errors if it isn't a directory. Exit 0 = success.
#
# Root cause this fixes: native worktree creation requires cwd to be inside a
# git repo. When Claude starts from a parent dir (e.g. ~/repos) whose
# subdirs are the actual repos, cwd itself is not a repo and Claude Code
# hard-errors with "not in a git repository and no WorktreeCreate hooks are
# configured". This hook adds the missing fallback while preserving native
# isolation behavior when cwd IS inside a repo.
set -euo pipefail

INPUT="$(cat)"
CWD="$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null || true)"
NAME="$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('name','worktree'))" 2>/dev/null || true)"

if [ -z "$CWD" ]; then
  echo "WorktreeCreate hook: missing cwd in hook input" >&2
  exit 1
fi

REPO_ROOT="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$REPO_ROOT" ]; then
  # cwd is not inside a git repo: fall back in-place (no isolation) instead
  # of hard-erroring, per Option A. WorktreeRemove must never touch this
  # path since it is never registered as a git worktree.
  echo "$CWD"
  exit 0
fi

# Mirror the native worktree naming scheme so hook-based worktrees behave
# identically to the built-in mechanism: .claude/worktrees/<name, / -> +>,
# branch worktree-<same>.
SAFE_NAME="${NAME//\//+}"
WORKTREE_DIR="$REPO_ROOT/.claude/worktrees/$SAFE_NAME"
BRANCH="worktree-$SAFE_NAME"

if [ -d "$WORKTREE_DIR" ]; then
  # Resuming an existing worktree (matches native "Resuming existing
  # worktree" behavior).
  echo "$WORKTREE_DIR"
  exit 0
fi

mkdir -p "$(dirname "$WORKTREE_DIR")"
git -C "$REPO_ROOT" worktree add --no-track -B "$BRANCH" "$WORKTREE_DIR" HEAD >&2

echo "$WORKTREE_DIR"
