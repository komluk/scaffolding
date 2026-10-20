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
3. Adds `.scaffolding/` to `.gitignore`
4. Installs the routing protocol in `$CWD/CLAUDE.md` — never overwrites an existing file: left alone if it already has the protocol or an `@...CLAUDE.md` import, otherwise the protocol is appended (a new file is created if absent)
5. Copies `settings.json` to `$CWD/.claude/settings.json` — always overwrites with latest from plugin
6. Copies `hooks/*.sh` to `$CWD/.claude/hooks/` — always overwrites with latest from plugin
7. Reports what was copied

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

### 3. Add .scaffolding/ to .gitignore

```bash
# Check if .gitignore exists and if .scaffolding/ is already in it
if [ -f ".gitignore" ]; then
  grep -q "^\.scaffolding/" .gitignore || echo -e "\n# Claude Scaffolding\n.scaffolding/" >> .gitignore
else
  echo -e "# Claude Scaffolding\n.scaffolding/" > .gitignore
fi
echo "UPDATED: .gitignore — .scaffolding/ is excluded from git"
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

### 7. Report result

Print a summary listing each action: CREATED/UPDATED/COPIED or SKIPPED, and its destination path.

After initializing, inform the user:
- `.scaffolding/` directory structure is ready for agent memory, conversations, and specs
- `.gitignore` has been updated to exclude `.scaffolding/` from version control
- CLAUDE.md in the project root carries the routing protocol (created, appended, or already present/imported and left untouched)
- settings.json is now in `.claude/` — hooks and agent permissions are active
- If either file was skipped (already existed), they can manually merge from the plugin root

## Notes

- This command is idempotent — safe to run multiple times
- CLAUDE.md is never overwritten (skipped if it already has the protocol or an `@...CLAUDE.md` import, else appended); settings.json and hooks are overwritten with the latest version from the plugin
- To customize project name, test commands, or other values, edit `CLAUDE.md` in
  the project root after running this command
