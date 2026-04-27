# claude-scaffolding

Portable Claude Code configuration: agents, skills, commands, hooks, and workflows.
Clone into any project and use it immediately — no Python libraries, no backend.

## Overview

`claude-scaffolding` is a self-contained `~/.claude/` carved out of the
[`scaffolding.tool`](https://github.com/komluk/scaffolding.tool) repo. It ships
only what travels as markdown — agent knowledge, skills, and configuration.
Anything that needs a backend, database, or long-running process stays in the
origin repo and is documented under [docs/locked-to-project/](docs/locked-to-project/README.md).

Goals:

- one `git clone` and you have the full set of agents, skills, and hooks
- no paths hardcoded to `/opt/platform/scaffolding.tool`
- parametrized via `install.sh` with auto-detected defaults
- idempotent re-render (`install.sh --refresh`)
- MIT licensed

## Differences from scaffolding.tool

This plugin is a distilled mirror of `scaffolding.tool` for standalone Claude
Code use — no FastAPI backend, no Postgres, no Redis required.

- **Agents:** same 11 canonical agents (analyst, architect, coordinator, debugger,
  developer, devops, gitops, optimizer, researcher, reviewer, tech-writer);
  omits `workflow-orchestrator`, which requires the FastAPI + Redis task queue.
- **Commands:** 15 commands — omits `/workflow` and `/distill` (both backend-dependent);
  includes `init-claude-scaffolding.md` for bootstrapping `CLAUDE.md` + `settings.json`
  into a target project.
- **Skills:** identical 31 skills; skills that reference backend services
  (e.g. `semantic-memory-store`) degrade gracefully when the backend is absent.
- **Hooks:** standalone versions that run entirely from the Claude Code runtime;
  `scaffolding.tool` hooks additionally integrate with the backend task queue,
  step-event pipeline, and SonarQube CLI.

## Quick start

### Which install flow should I pick?

| Flow | When to use | Agent namespace |
|------|-------------|-----------------|
| `/plugin install claude-scaffolding@komluk-scaffolding` | Most users, zero-config, native Claude Code marketplace | `claude-scaffolding:developer` (prefixed) |
| `./install.sh --target /path/to/repo` | You want files copied into a repo tree, custom config via `~/.claude-scaffolding.env` | `developer` (bare — `install.sh` strips the prefix automatically) |

Additional guidance:

| Need | Flow |
|------|------|
| Upgrade via `/plugin update` | Option A (Plugin) |
| Custom `__CLAUDE_SCAFFOLDING_PROJECT_NAME__`, Sonar key, test commands | Option B (`install.sh`) |
| Per-project `.claude/` vs user-level integration | Option B (`install.sh --target`) |
| Developing/editing claude-scaffolding components | Option B (clone repo) |

---

### Option A — Claude Code plugin (recommended for quick start)

**Requirement:** `komluk/claude-scaffolding` is a private repository, so the
Claude Code CLI must be authenticated to a GitHub account with access to the
repo. Before first use, run:

```bash
gh auth login
# Choose: GitHub.com, HTTPS, login with web browser, scope: repo
```

**Post-install steps (ALL required):**

```
1. /plugin marketplace add komluk/claude-scaffolding
2. /plugin install claude-scaffolding@komluk-scaffolding
3. /reload-plugins                       ← REQUIRED: Claude Code does not hot-reload the agent registry
4. (optional) /init-claude-scaffolding   ← see "Do you need /init-claude-scaffolding?" below
5. Task(subagent_type="claude-scaffolding:developer", prompt="...")
```

> **Without `/reload-plugins`** the `subagent_type` registry is not refreshed
> after installing the plugin — `Task(subagent_type="claude-scaffolding:developer")`
> will return `Agent type not found`. Restarting the entire `claude` session
> works as an alternative to `/reload-plugins`.

The plugin lands in `~/.claude/plugins/cache/komluk-scaffolding/claude-scaffolding/<version>/`.
Parameters are baked in as sensible defaults (`pytest`, `npm test`, `./backend`, etc.).
If you need custom values, use Option B.

---

### Option B — Clone + install.sh (full parametrization)

```bash
# 1. Clone straight into ~/.claude/ (user-level)
git clone https://github.com/komluk/claude-scaffolding ~/.claude
cd ~/.claude
./install.sh

# OR: clone elsewhere and render into a project-level .claude/
git clone https://github.com/komluk/claude-scaffolding ~/src/claude-scaffolding
cd ~/src/claude-scaffolding
./install.sh --target /path/to/your/project/.claude
```

`install.sh` prompts for a few values (backend test command, frontend validate
command, SonarQube key, project name, etc.), saves them in
`~/.claude-scaffolding.env`, and renders `__CLAUDE_SCAFFOLDING_*__` placeholders
from `templates/*.tmpl` into the target. To change values later, edit
`~/.claude-scaffolding.env` and run:

```bash
./install.sh --refresh
```

This is idempotent — every subsequent invocation produces identical output
without prompts.

`install.sh` automatically copies `CLAUDE.md` and `settings.json` to the target
directory and strips the `claude-scaffolding:` prefix from rendered files. No
extra steps needed — agents are immediately available as bare names (e.g.
`Task(subagent_type="developer")`).

---

### Do you need `/init-claude-scaffolding`? (Option A only)

This command copies `CLAUDE.md` and `settings.json` into the project's `$CWD`
(without overwriting). It applies only to the plugin flow — `install.sh` does
this automatically.

| Scenario | Run init? | Why |
|----------|-----------|-----|
| Solo project, plugin always installed | No | The SessionStart hook injects the protocol on every session start |
| Team repo, others clone without the plugin | Yes | `CLAUDE.md` in-repo means the protocol travels with the code |
| CI/automation reads the repo | Yes | A committed `CLAUDE.md` gives reproducible context |
| One-off / PoC project | No | The hook is enough; don't clutter the repo |

**Mechanical difference:**

- **Hook-based** (default after install + reload): the protocol lives in
  `SessionStart` hook output — ephemeral, per-session, requires the active plugin.
- **Init-based** (after `/init-claude-scaffolding`): `CLAUDE.md` is written to
  `$CWD` — persistent, versioned in git, works even without the plugin.

---

### Common gotchas

**`Agent type 'developer' not found`**
- You forgot to run `/reload-plugins` after install, OR
- You used the bare name `developer` in the plugin flow — use `claude-scaffolding:developer` instead.

> The `claude-scaffolding:` prefix applies only to agents installed via the
> Claude Code marketplace (plugin runtime). For agents defined locally in
> `.claude/agents/` (the `install.sh --target` flow), use bare names without
> the prefix.

**"Claude ignores the delegation protocol"**
- The plugin is loaded but `/reload-plugins` was not run after install, OR
- You're on an older hook version (before commit `45cb106`) that used plain
  `echo` instead of `hookSpecificOutput.additionalContext`.

**"I installed the plugin, but nothing works in a new session"**
- Restart Claude Code entirely (not just opening a new session) — the plugin
  cache may be stale. `/reload-plugins` is faster if a session is already active.

## Requirements

- `git`
- `python3` (any 3.x version, no pip dependencies)
- Claude Code CLI (https://claude.ai/code)

## What's inside

```
claude-scaffolding/
├── agents/         11 agents (analyst, architect, coordinator, developer,
│                    debugger, devops, gitops, optimizer,
│                    researcher, reviewer, tech-writer)
├── skills/         31 skills (api-design, error-handling, pattern-recognition,
│                    spec-*, mui-styling, python-patterns, testing-strategy, ...)
├── commands/       15 slash commands: 5 top-level (context, execute-prp,
│                    generate-prp, init-openspec, init-claude-scaffolding) + 10 in `commands/specs/`
│                    (apply, archive, bulk-archive, continue, explore, ff,
│                    new, onboard, sync, verify) — namespaced OpenSpec commands
├── hooks/          7 safety hooks (block-destructive-rm,
│                    block-env-write, pre-commit-validation, ...)
├── templates/      PRP templates (base, planning, spec)
├── validators/     Markdown validators (output-frontmatter, prp-document)
├── output-styles/  output-frontmatter definition
├── workflows/      YAML workflow and coordinate definitions
├── install.sh      Parametrized installer
├── uninstall.sh    Undo install.sh (removes the rendered copy)
├── CLAUDE.md       Main project prompt (with placeholders)
└── settings.json   Hooks + statusline + permissions
```

## What's not here (Tier C)

Components that depend on the `scaffolding.tool` runtime are NOT here — they
are documented in [docs/locked-to-project/](docs/locked-to-project/README.md).
Short list:

| Component | Why not in claude-scaffolding |
|-----------|-------------------------------|
| `semantic-memory` MCP server | Needs Postgres + pgvector + embedding model |
| `semantic-memory-store` skill | Calls bash into a FastAPI backend |
| `/workflow` command | Needs FastAPI + Redis + worker |
| `/distill` command | Needs the distill CLI + DB |
| `ui-ux-pro-max` scripts/data | Python CLI + CSV database |

Skills that reference these components have defensive fallbacks: if the
dependencies are unavailable, the agent skips the relevant section rather
than crashing.

## Updating

The repo has a stable file API — new versions add agents and skills, never
remove them. To update:

```bash
cd ~/.claude  # or wherever you cloned claude-scaffolding
git pull
./install.sh --refresh  # re-renders placeholders from the existing .env
```

Idempotency is tested — two consecutive `./install.sh --refresh` runs produce
bit-identical files.

## Parametrization

The full list of `__CLAUDE_SCAFFOLDING_*__` placeholders lives in
[docs/parametrization.md](docs/parametrization.md). Short version:

- `CLAUDE_SCAFFOLDING_TEST_BACKEND_CMD` — backend test command
- `CLAUDE_SCAFFOLDING_TEST_FRONTEND_CMD` — frontend validate command
- `CLAUDE_SCAFFOLDING_PROJECT_NAME` — project name (defaults to `basename $PWD`)
- `CLAUDE_SCAFFOLDING_SONAR_PROJECT_KEY` — SonarQube key (optional)
- `CLAUDE_SCAFFOLDING_SCHEMAS_DIR` — OpenSpec schemas directory
- `CLAUDE_SCAFFOLDING_BACKEND_EXAMPLE_PATH` — example backend feature path

`install.sh` auto-detects each of these — it reads `package.json`, looks for
`venv/`, checks `.sonarlint/connectedMode.json`, etc. Any field can be skipped
with Enter and revisited later via `~/.claude-scaffolding.env`.

## Documentation

- [docs/installation.md](docs/installation.md) — detailed install options
- [docs/parametrization.md](docs/parametrization.md) — full placeholder table
- [docs/adopting-in-legacy-repo.md](docs/adopting-in-legacy-repo.md) —
  how to add this to an existing project that already has its own `.claude/`
- [docs/locked-to-project/](docs/locked-to-project/README.md) — Tier C
- [CHANGELOG.md](CHANGELOG.md) — release history

## Versioning

The project follows [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).

| Bump | When |
|------|------|
| **MAJOR** (X.0.0) | Breaking changes: removing an agent/skill/command, changing the `install.sh` API, incompatible `plugin.json` schema changes |
| **MINOR** (x.Y.0) | New agent/skill/command/hook, new `install.sh` option, new CI feature (backward compatible) |
| **PATCH** (x.y.Z) | Bug fix, typo, documentation tweaks |

Source of truth for the version: `.claude-plugin/plugin.json` (`version` field).
The git tag MUST match (`v${version}`) — this is enforced by `release.yml` in
GitHub Actions. Every `v*` tag automatically creates a GitHub Release with
`install.sh`, `uninstall.sh`, and `.claude-scaffolding.env.example` as assets.

Version history: [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
