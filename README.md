# claude-scaffolding

Portable Claude Code configuration: 11 agents, 31 skills, 15 commands, 8 hooks,
spec-driven workflows. Installs as a Claude Code plugin from a private GitHub
marketplace.

## Overview

`claude-scaffolding` is a self-contained `~/.claude/` carved out of the
[`scaffolding.tool`](https://github.com/komluk/scaffolding.tool) repo. It ships
only what travels as markdown — agent knowledge, skills, and configuration.
Anything that needs a backend, database, or long-running process stays in the
origin repo and is documented under [docs/locked-to-project/](docs/locked-to-project/README.md).

## Differences from scaffolding.tool

This plugin is a distilled mirror of `scaffolding.tool` for standalone Claude
Code use — no FastAPI backend, no Postgres, no Redis required.

- **Agents:** same 11 canonical agents (analyst, architect, coordinator, debugger,
  developer, devops, gitops, optimizer, researcher, reviewer, tech-writer);
  omits `workflow-orchestrator`, which requires the FastAPI + Redis task queue.
- **Commands:** 15 commands — omits `/workflow` and `/distill` (both backend-dependent);
  includes `/init-scaffolding` for bootstrapping `CLAUDE.md` + `settings.json`
  + `.scaffolding/` into a project.
- **Skills:** identical 31 skills; skills that reference backend services
  (e.g. `semantic-memory-store`) degrade gracefully when the backend is absent.
- **Hooks:** standalone versions that run entirely from the Claude Code runtime;
  `scaffolding.tool` hooks additionally integrate with the backend task queue,
  step-event pipeline, and SonarQube CLI.

## Install

**Requirement:** `komluk/scaffolding` is a private repository, so the Claude Code
CLI must be authenticated to a GitHub account with access to it. Before first
use, run:

```bash
gh auth login
# Choose: GitHub.com, HTTPS, login with web browser, scope: repo
```

**Steps:**

```
1. /plugin marketplace add komluk/scaffolding
2. /plugin install scaffolding@komluk-scaffolding
3. /reload-plugins                       ← REQUIRED: Claude Code does not hot-reload the agent registry
4. /init-scaffolding                     ← run once per project to create .scaffolding/ + copy CLAUDE.md
5. Task(subagent_type="scaffolding:developer", prompt="...")
```

> **Without `/reload-plugins`** the `subagent_type` registry is not refreshed
> after install — `Task(subagent_type="scaffolding:developer")` will return
> `Agent type not found`. Restarting `claude` works as an alternative.

The plugin lands in `~/.claude/plugins/marketplaces/komluk-scaffolding/`.
Default values (`pytest`, `npm test`, `(project)`, etc.) are baked in. To
override per-project, edit the rendered `CLAUDE.md` after running `/init-scaffolding`.

## Per-project setup: `/init-scaffolding`

After the plugin is installed, run `/init-scaffolding` from the project root.
It creates the `.scaffolding/` directory structure (agent memory, conversations,
worktrees, OpenSpec specs, reports), adds `.scaffolding/` to `.gitignore`, and
copies `CLAUDE.md` + `settings.json` + `hooks/` into the project. Idempotent —
safe to re-run; CLAUDE.md and settings.json are always overwritten with the
latest plugin version, hook scripts are always copied.

| Scenario | Run init? |
|----------|-----------|
| Solo project | Optional — the plugin's `SessionStart` hook injects the routing protocol on every session |
| Team repo (others clone without the plugin) | Yes — `CLAUDE.md` in-repo means the protocol travels with the code |
| CI / automation reads the repo | Yes — a committed `CLAUDE.md` gives reproducible context |

## Common gotchas

**`Agent type 'developer' not found`**
- Forgot `/reload-plugins` after install, OR used the bare name. Use `scaffolding:developer`.

**"Claude ignores the delegation protocol"**
- Plugin loaded but `/reload-plugins` was not run after install.

**"I installed the plugin, but nothing works in a new session"**
- Restart Claude Code entirely — the plugin cache may be stale. `/reload-plugins`
  is faster if a session is already active.

## Requirements

- `git`
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
│                    generate-prp, init-openspec, init-scaffolding) + 10 in `commands/specs/`
│                    (apply, archive, bulk-archive, continue, explore, ff,
│                    new, onboard, sync, verify) — namespaced OpenSpec commands
├── hooks/          8 safety + lifecycle hooks (block-destructive-rm,
│                    block-env-write, pre-commit-validation,
│                    session-start-protocol, ...)
├── templates/      Shared agent reference docs (output-frontmatter schema,
│                    agents/skills overview, responsibility matrix)
├── validators/     Markdown validators (output-frontmatter, prp-document)
├── output-styles/  output-frontmatter definition
├── workflows/      YAML workflow and coordinate definitions
├── CLAUDE.md       Main project prompt
└── settings.json   Hooks + statusline + permissions
```

## What's not here (Tier C)

Components that depend on the `scaffolding.tool` runtime are NOT here — they
are documented in [docs/locked-to-project/](docs/locked-to-project/README.md).

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

```
/plugin update scaffolding@komluk-scaffolding
/reload-plugins
```

Re-run `/init-scaffolding` in projects where you want the latest `CLAUDE.md`
and hooks copied in.

## Documentation

- [docs/adopting-in-legacy-repo.md](docs/adopting-in-legacy-repo.md) —
  how to add this to an existing project that already has its own `.claude/`
- [docs/locked-to-project/](docs/locked-to-project/README.md) — Tier C components
- [CHANGELOG.md](CHANGELOG.md) — release history

## Versioning

The project follows [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).

| Bump | When |
|------|------|
| **MAJOR** (X.0.0) | Breaking changes: removing an agent/skill/command, incompatible `plugin.json` schema changes, install path changes |
| **MINOR** (x.Y.0) | New agent/skill/command/hook, new feature in CI (backward compatible) |
| **PATCH** (x.y.Z) | Bug fix, typo, documentation tweaks |

Source of truth for the version: `.claude-plugin/plugin.json` (`version` field).
The git tag MUST match (`v${version}`) — enforced by `release.yml` in GitHub
Actions.

Version history: [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
