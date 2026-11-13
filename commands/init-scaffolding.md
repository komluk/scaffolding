# /init-scaffolding Command

Bootstrap a new project with the scaffolding CLAUDE.md, settings.json, and `.scaffolding/` directory structure.

## Usage

```
/init-scaffolding
```

Run from the root of a project that was set up via `/plugin install scaffolding@komluk-scaffolding`.
This command creates the `.scaffolding/` directory structure, copies the routing protocol and settings
into the project so Claude respects the agent delegation rules on every session.

## What It Does

1. Locates the installed plugin directory (searches known marketplace cache paths)
2. Creates `.scaffolding/` directory structure for agent memory, conversations, and specs
3. Adds `.scaffolding/` and `.claude/worktrees/` to `.gitignore`
4. Installs the routing protocol in `$CWD/CLAUDE.md` — never overwrites an existing file: left alone if it already has the protocol or an `@...CLAUDE.md` import, otherwise the protocol is appended (a new file is created if absent)
5. Copies `settings.json` to `$CWD/.claude/settings.json` — always overwrites with latest from plugin
6. Copies `hooks/*.sh` to `$CWD/.claude/hooks/` — always overwrites with latest from plugin
7. Writes `.scaffolding.json` (pinned memory `project_id`) at the repo root when missing and there is an `owner/repo` remote
8. Reports what was copied

## Steps

Follow these steps exactly:

### 1. Find the plugin root directory

Search for the plugin in the known Claude Code plugin cache location:

```bash
PLUGIN_ROOT=""

# Search helper: find latest version directory containing CLAUDE.md under a base path
find_plugin_root() {
  local base="$1"
  [ -d "$base" ] || return
  # Try versioned path: base/scaffolding/<version>/CLAUDE.md
  local latest
  latest=$(find "$base" -name "CLAUDE.md" -path "*/scaffolding/*/CLAUDE.md" 2>/dev/null | sort -V | tail -1 | xargs dirname 2>/dev/null || true)
  if [ -n "$latest" ] && [ -f "$latest/CLAUDE.md" ]; then
    echo "$latest"
    return
  fi
  # Fallback: any CLAUDE.md anywhere under this base
  latest=$(find "$base" -name "CLAUDE.md" 2>/dev/null | sort -V | tail -1 | xargs dirname 2>/dev/null || true)
  if [ -n "$latest" ] && [ -f "$latest/CLAUDE.md" ]; then
    echo "$latest"
    return
  fi
}

# Unix / macOS (Linux, macOS, WSL)
for base in \
  "$HOME/.claude/plugins/cache/komluk-scaffolding" \
  "$HOME/.claude/plugins/marketplaces/komluk-scaffolding"; do
  found=$(find_plugin_root "$base")
  if [ -n "$found" ]; then
    PLUGIN_ROOT="$found"
    break
  fi
done

# Windows (Git Bash / MSYS2) — USERPROFILE and LOCALAPPDATA are set by the shell
if [ -z "$PLUGIN_ROOT" ]; then
  for base in \
    "${USERPROFILE:-}/.claude/plugins/cache/komluk-scaffolding" \
    "${LOCALAPPDATA:-}/claude/plugins/cache/komluk-scaffolding"; do
    [ -n "$base" ] || continue
    found=$(find_plugin_root "$base")
    if [ -n "$found" ]; then
      PLUGIN_ROOT="$found"
      break
    fi
  done
fi

echo "Plugin root: ${PLUGIN_ROOT:-NOT FOUND}"
```

If `PLUGIN_ROOT` is empty, report that the plugin was not found and stop. The user may need to run `/plugin install scaffolding@komluk-scaffolding` first.

### 2. Create .scaffolding/ directory structure

```bash
mkdir -p .scaffolding/conversations
mkdir -p .scaffolding/agent-memory/shared
mkdir -p .scaffolding/agent-memory/agents
mkdir -p .scaffolding/worktrees
mkdir -p .scaffolding/openspec/specs
mkdir -p .scaffolding/openspec/schemas
mkdir -p .scaffolding/reports
echo "CREATED: .scaffolding/ directory structure"

# Link conversations to the shared NFS share (no-op without a reachable share;
# <share> = $SCAFFOLDING_NFS_ROOT, else /mnt/scaffolding-data or /mnt/scaffolding)
bash "$PLUGIN_ROOT/hooks/nfs-sync.sh" link "$PWD"
```

`conversations/` becomes a symlink to `<share>/projects/<repo-name>/conversations`; an empty local dir is replaced, a populated one is copied (no overwrite) and kept as `conversations.pre-nfs-<ts>`.

### 3. Add .scaffolding/ and .claude/worktrees/ to .gitignore

`.claude/worktrees/` holds legacy native Claude Code worktrees (current ones live under `.scaffolding/worktrees/`); ignore it so git does not track them.

```bash
touch .gitignore
grep -q "^\.scaffolding/" .gitignore || printf '\n# Claude Scaffolding\n.scaffolding/\n' >> .gitignore
grep -q "^\.claude/worktrees/" .gitignore || printf '\n# Claude Code legacy native worktrees\n.claude/worktrees/\n' >> .gitignore
echo "UPDATED: .gitignore — .scaffolding/ and .claude/worktrees/ are excluded from git"
```

### 4. Install CLAUDE.md routing protocol (never overwrite)

```bash
if [ ! -f "$CWD/CLAUDE.md" ]; then
  cp "$PLUGIN_ROOT/CLAUDE.md" "$CWD/CLAUDE.md"
  echo "CREATED: CLAUDE.md -> $CWD/CLAUDE.md"
elif grep -qE 'subagent_type="scaffolding:|^@.*CLAUDE\.md' "$CWD/CLAUDE.md"; then
  echo "SKIPPED: CLAUDE.md already has the routing protocol or an @...CLAUDE.md import (left unchanged)"
else
  { printf '\n'; cat "$PLUGIN_ROOT/CLAUDE.md"; } >> "$CWD/CLAUDE.md"
  echo "APPENDED: routing protocol -> $CWD/CLAUDE.md (existing content preserved)"
fi
```

### 5. Copy settings.json (always overwrite)

```bash
mkdir -p "$CWD/.claude"
cp "$PLUGIN_ROOT/settings.json" "$CWD/.claude/settings.json"
echo "COPIED: settings.json -> $CWD/.claude/settings.json (overwritten with latest)"
```

### 6. Copy hooks directory (always overwrite)

```bash
mkdir -p "$CWD/.claude/hooks"
cp "$PLUGIN_ROOT/hooks/"*.sh "$CWD/.claude/hooks/"
chmod +x "$CWD/.claude/hooks/"*.sh
echo "COPIED: hooks/ -> $CWD/.claude/hooks/ (all hook scripts)"
```

### 7. Pin the memory project_id in .scaffolding.json (only if missing)

`.scaffolding.json` at the repo root pins the memory / correlation `project_id` for every clone and device (the
SessionStart hook `memory-project-id.sh` reads it first and falls back to the remote-derived id). It is committed,
unlike `.scaffolding/`. The id written is the one the hook derives today: `sha256("owner/repo", lowercase)[:16]`.
Never overwrite an existing file. Without an `owner/repo` slug (no remote, or a single-segment remote) skip it:
a path-derived id is not portable.

```bash
if [ -e .scaffolding.json ] || [ -L .scaffolding.json ]; then
  echo "SKIPPED: .scaffolding.json already exists (left unchanged)"
else
  remote="$(git config --get remote.origin.url 2>/dev/null || true)"
  slug="$(printf '%s' "$remote" | sed -E 's#[/:]+$##; s#\.git$##; s#^.*[:/]([^/:]+/[^/:]+)$#\1#' | tr '[:upper:]' '[:lower:]')"
  case "$slug" in
    */*)
      if command -v sha256sum >/dev/null 2>&1; then h="$(printf '%s' "$slug" | sha256sum | cut -c1-16)"
      else h="$(printf '%s' "$slug" | shasum -a 256 | cut -c1-16)"; fi
      printf '{"project_id": "scaffold:%s"}\n' "$h" > .scaffolding.json
      echo "CREATED: .scaffolding.json (scaffold:$h) — commit it"
      ;;
    *) echo "SKIPPED: .scaffolding.json — no owner/repo remote (a path id is not portable); re-run after adding origin" ;;
  esac
fi
```

### 8. Report result

Print a summary listing each action: CREATED/UPDATED/COPIED or SKIPPED, and its destination path.

After initializing, inform the user:
- `.scaffolding/` directory structure is ready for agent memory, conversations, and specs
- If `.scaffolding.json` was created, tell the user to **commit it** (it is not ignored); it pins the memory `project_id` so every clone and device shares one scope
- `.gitignore` has been updated to exclude `.scaffolding/` and `.claude/worktrees/` from version control
- CLAUDE.md in the project root carries the routing protocol (created, appended, or already present/imported and left untouched)
- settings.json is now in `.claude/` — hooks and agent permissions are active
- If either file was skipped (already existed), they can manually merge from the plugin root

## Notes

- This command is idempotent — safe to run multiple times
- CLAUDE.md is never overwritten (skipped if it already has the protocol or an `@...CLAUDE.md` import, else appended); settings.json and hooks are overwritten with the latest version from the plugin
- To customize project name, test commands, or other values, edit `CLAUDE.md` in
  the project root after running this command
