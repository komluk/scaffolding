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

### 5. memory-ingest-mark.sh
**Type:** SubagentStop hook
**Triggers:** When a scaffolding subagent finishes (a `Task()` completes)
**Purpose:** Cheap "source finished" dirty-mark so end-of-turn ingest can fire

**What it does:**
- Pure bash file checks — **no LLM, no network, no MCP**, sub-50ms
- Throttle: only marks when a `.scaffolding/conversations/**/context.md` is newer
  than the last ingest (`.scaffolding/.ingest-seen`)
- On a significant subagent: `touch .scaffolding/.ingest-dirty` and appends a
  JSONL breadcrumb to `.scaffolding/.ingest-queue`
- **Always exits 0**; opt-out via `SCAFFOLDING_MEMORY_INGEST=off` or `.noingest`

### 6. memory-ingest.sh
**Type:** Stop hook
**Triggers:** When the main agent finishes a turn
**Purpose:** Enforce a memory ingest exactly once per turn when the session is dirty

**What it does:**
- **Loop guard:** reads `stop_hook_active` from stdin; exits 0 if already
  re-triggered (same pattern as `completion-nudge.sh`) — a block fires at most
  once/turn
- No-op unless `.scaffolding/.ingest-dirty` exists
- The hook performs **no ingest itself** — it emits a directive (`reason`) telling
  the agent to run `distill` INLINE (no subagents), auto-`semantic_store` high-
  confidence (>= 0.8) candidates, queue the rest to `.ingest-queue`, append a line
  to `.scaffolding/agent-memory/log.md`, then clear `.ingest-dirty`
- **Tri-state** env `SCAFFOLDING_MEMORY_INGEST` (see table below)
- **Always exits 0**

#### Runtime artefacts (created in the user's project `.scaffolding/`)

| Path | Role | Lifecycle |
|------|------|-----------|
| `.scaffolding/.ingest-dirty` | "needs ingest" sentinel | set by mark, cleared after ingest |
| `.scaffolding/.ingest-queue` | JSONL breadcrumbs + low-conf candidates | drained by `/learn` |
| `.scaffolding/.ingest-seen` | md5 dedup ledger | append-only, per-repo |
| `.scaffolding/agent-memory/log.md` | append-only ingest log | git-tracked |
| `.scaffolding/.noingest` | per-repo opt-out | manual `touch` |

### 7. nfs-sync.sh
**Type:** SessionStart hook (startup/resume) + CLI
**Purpose:** Make `<repo>/.scaffolding/conversations` a symlink to the shared NFS share, so every machine sees one copy of every conversation. No sync, no mirror.

**Layout:** `<repo>/.scaffolding/conversations -> <share>/projects/<repo-name>/conversations` (`<repo-name>` = basename of the project dir; `~/repos` maps to `projects/repos`).

**Per local `.scaffolding/conversations`:**

| State | Action |
|-------|--------|
| symlink to the share target | no-op |
| absent or empty dir | `mkdir -p` target, `ln -s` |
| populated real dir | `cp -n` (no clobber) into the target, verify every file, `mv` local to `conversations.pre-nfs-<ts>`, `ln -s` |
| foreign symlink / share unreachable / any error | left untouched, warning on stderr |

Same path on both sides with different content: the share copy is kept, the local copy stays in `.pre-nfs-<ts>/`, and the conflict is listed on stderr. If the copy cannot be verified, or `ln` fails, nothing is changed (the original dir is restored).

**Usage:**
- `nfs-sync.sh pull` — SessionStart: links `CLAUDE_PROJECT_DIR` and each immediate child git repo that already has `.scaffolding/`. Opt-in (below).
- `nfs-sync.sh link [--dry-run] [dir...]` — explicit setup/migration (no opt-in needed; default dir is the project dir). `--dry-run` prints the plan and changes nothing. Called by `/init-scaffolding` and `/init-openspec`.
- `nfs-sync.sh push` — no-op (the Stop hook is unwired).

**`<share>` (per machine):** `SCAFFOLDING_NFS_ROOT`, else the first of `/mnt/scaffolding-data`, `/mnt/scaffolding` that has a `projects/` dir.

**Enable `pull` (default is OFF):** set `SCAFFOLDING_NFS_ROOT`, or create `.scaffolding/.nfs-sync` (empty = auto-detect; an absolute path on line 1 names the share).

**Environment variables:**
- `SCAFFOLDING_NFS_ROOT` — share root; overrides the sentinel and auto-detect
- `SCAFFOLDING_NFS_TIMEOUT` (default `20`) — per NFS operation, seconds
- `SCAFFOLDING_NFS_COPY_TIMEOUT` (default `120`) — copy + verify, seconds
- `SCAFFOLDING_NFS_PROBE_TIMEOUT` (default `5`) — reachability probe, seconds

**Safety guarantees:** every NFS operation runs under `timeout -k 2`; never overwrites or deletes share data; the local dir is only replaced after a verified copy and is kept as a backup; always exits 0.

**Related:** `count-conversations.sh <root>...` prints `<project> <n_conv> <n_files>` (sorted) for before/after migration counts. Tests: `bash tests/run-all.sh`.

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
| `SCAFFOLDING_MEMORY_INGEST` | advisory | unset → advisory (stderr nudge); `=block` → enforce (`decision:block`); `=off` → disabled. `memory-ingest{,-mark}.sh` |
| `SCAFFOLDING_MEMORY_RECALL` | off | `=on` enables `memory-recall.sh` (see below) |

## Opt-in: memory recall (UserPromptSubmit)

`memory-recall.sh` is off by default. When `SCAFFOLDING_MEMORY_RECALL=on`, it:

- Sends the first 500 characters of each non-trivial prompt to your memory MCP
  `semantic_search` tool using one stateless JSON-RPC `tools/call` POST.
- Injects up to 5 hits as `additionalContext`, wrapped in `<recalled-memories>` and
  marked as untrusted reference data. Injected text is never treated as instructions.
- Injects nothing when the server returns no hits (the server applies the distance cutoff).

**Environment variables:**

| Variable | Default | Meaning |
|----------|---------|---------|
| `SCAFFOLDING_MEMORY_RECALL` | off | `on` enables the hook |
| `SCAFFOLDING_MEMORY_RECALL_URL` | — (required) | MCP endpoint URL |
| `SCAFFOLDING_MEMORY_RECALL_TOKEN` | — | Bearer token (see fallback rule) |
| `SCAFFOLDING_MEMORY_RECALL_TOOL` | `memory-semantic_search` | MCP tool name to call |
| `SCAFFOLDING_MEMORY_RECALL_TIMEOUT` | `2` | Seconds; capped at `2.5` to stay under the 3 s hook limit |

**Token fallback:** if `SCAFFOLDING_MEMORY_RECALL_TOKEN` is unset, `ANTHROPIC_API_KEY` is
used only when the URL host equals the `ANTHROPIC_BASE_URL` host (your own gateway). A real
API key is never sent to a third party.

**Transport rules:**

- `https` is accepted to any host.
- Plain `http` is accepted only for loopback, private (RFC 1918) addresses, and `.local`,
  `.internal`, `.home.arpa` names (use the IP or `https` for any other local suffix).
- Redirects are refused and proxies are ignored, so the token only goes to the configured URL.

**Skip heuristics:** prompts shorter than 20 characters, prompts starting with `/`, and
bare acknowledgements (`ok`, `yes`, `thanks`, `dalej`, etc.) are not sent.

**Fail-silent:** any error, timeout, skip or zero hits prints nothing and exits 0.

**Requirements:** `python3` and `timeout`. On macOS, install coreutils (`brew install coreutils`)
to get `timeout`; without it the hook silently does nothing.

**Security notes:**

- Prompt text, including anything pasted into the first 500 characters, is sent to your
  memory service and may appear in gateway logs.
- `http` is cleartext. Use it only on a network you trust.
- Memory store content is injected into sessions. Treat everything that gets stored as a
  trusted-input surface and avoid storing untrusted content.

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
