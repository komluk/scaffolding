# Claude Code Hooks

This directory contains hooks that run automatically during Claude Code workflows.

## Available Hooks

### 1. post-edit-review.sh
**Type:** PostToolUse hook
**Triggers:** After Edit or Write tool usage
**Purpose:** Suggests running code review commands after making code changes

**What it does:**
- Detects when files are modified
- Suggests relevant review commands (/code-review, /security-review, /test-coverage)
- Non-blocking (allows edit to proceed)

### 2. pre-commit-validation.sh
**Type:** PreToolUse hook (for git commit operations)
**Triggers:** Before git commit commands
**Purpose:** Runs validation checks to prevent committing broken code

**What it does:**
- Detects frontend changes → runs `npm run validate`
- Detects backend changes → runs `pytest`
- Blocks commit if validation fails
- Ensures code quality before it enters git history

### 3. post-edit-format.sh
**Type:** PostToolUse hook (Edit|Write)
**Triggers:** After Edit or Write tool usage
**Purpose:** Auto-format the single edited file with a runtime-detected formatter

**What it does:**
- Extracts `file_path` from stdin JSON (no jq dependency)
- Detects a formatter by extension and formats **only that one file**:
  - `.py` → `ruff format` then `black` (project venv bin first, then PATH)
  - `.ts/.tsx/.js/.jsx/.json/.css/.scss` → `prettier` (`node_modules/.bin` then `npx --no-install`)
  - `.cs` → `dotnet format`
- Skips silently when no formatter is present; swallows formatter errors
- **Always exits 0** — best-effort cosmetic, never blocks an edit
- **Opt-in:** gated behind env `SCAFFOLDING_AUTOFORMAT=1` (default off)

### 4. notify.sh
**Type:** Stop / Notification hook
**Triggers:** When Claude finishes a turn (Stop) or raises a Notification
**Purpose:** Desktop/terminal notification that a task finished or needs input

**What it does:**
- `notify-send` (Linux), else `osascript` (macOS), plus a terminal bell on a TTY
- Pure no-op when no notifier is available
- **Opt-in:** gated behind env `SCAFFOLDING_NOTIFY=1` (default off — noisy in CI)

## PostToolUse(Edit|Write) ordering — CRITICAL

The registered order in **both** `.claude-plugin/plugin.json` and `settings.json`
MUST be:

```
1. post-edit-review.sh       (advisory, unchanged)
2. post-edit-format.sh       (NEW — mutates the file, bumps mtime)
3. file-staleness-update.sh  (MUST stay LAST — records post-format mtime)
```

Hooks run in listed array order. `file-staleness-update.sh` records the file's
mtime so the next PreToolUse `file-staleness-check.sh` allows the next edit. If
`post-edit-format.sh` ran *after* staleness-update, it would rewrite the file and
bump the mtime past the recorded value, so the next edit would be falsely blocked
as "modified externally". Formatting **before** staleness-update records the
post-format mtime and avoids this. Never move `file-staleness-update.sh` out of
the last position.

## Environment flags

| Flag | Default | Effect |
|------|---------|--------|
| `SCAFFOLDING_AUTOFORMAT` | off | `=1` enables `post-edit-format.sh` auto-formatting |
| `SCAFFOLDING_NOTIFY` | off | `=1` enables `notify.sh` desktop/terminal notifications |

## Hook Configuration

Hooks are configured in `.claude/settings.json`. See that file for:
- Which hooks are enabled
- Tool matchers (which tools trigger which hooks)
- Hook execution order

## Making Hooks Executable

On Unix systems, hooks need execute permissions:

```bash
chmod +x .claude/hooks/*.sh
```

On Windows with Git Bash, this is handled automatically.

## Testing Hooks

### Test post-edit-review.sh
```bash
# Make a test edit and see the suggestion
echo "test" >> test.txt
```

### Test pre-commit-validation.sh
```bash
# Try to commit with validation errors
cd app/frontend
# Make a breaking change
git add .
git commit -m "test commit"
# Hook should block if validation fails
```

## Disabling Hooks

To temporarily disable hooks, comment them out in `.claude/settings.json`:

```json
{
  "hooks": {
    // "PostToolUse": [ ... ]
  }
}
```

## Hook Best Practices

1. **Fast execution** - Hooks should run quickly (< 5 seconds)
2. **Clear output** - Always explain what the hook is doing
3. **Non-breaking** - PostToolUse hooks should exit 0 to allow operation
4. **Blocking when needed** - PreToolUse hooks can exit 1 to block bad operations
5. **Helpful messages** - Guide users on how to fix issues

## Troubleshooting

**Hook not running:**
- Check `.claude/settings.json` configuration
- Verify hook file has execute permissions
- Check hook script for syntax errors

**Hook always fails:**
- Test the hook script manually: `bash .claude/hooks/script.sh`
- Check that required tools are available (npm, pytest, etc.)
- Verify paths are correct (hooks run from repository root)

## Future Hooks

Ideas for additional hooks:
- Pre-push hook: Run full test suite before pushing
- Post-commit hook: Generate changelog entry
- Pre-PR hook: Verify PR requirements met
