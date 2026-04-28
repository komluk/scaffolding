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
4. Copies `CLAUDE.md` to `$CWD/CLAUDE.md` — always overwrites with latest from plugin
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
```

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

### 4. Copy CLAUDE.md (always overwrite)

```bash
cp "$PLUGIN_ROOT/CLAUDE.md" "$CWD/CLAUDE.md"
echo "COPIED: CLAUDE.md -> $CWD/CLAUDE.md (overwritten with latest)"
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
- CLAUDE.md is now in the project root — Claude will load the routing protocol on every session
- settings.json is now in `.claude/` — hooks and agent permissions are active
- If either file was skipped (already existed), they can manually merge from the plugin root

## Notes

- This command is idempotent — safe to run multiple times
- CLAUDE.md and settings.json are always overwritten with the latest version from the plugin
- To customize project name, test commands, or other values, edit `CLAUDE.md` in
  the project root after running this command
