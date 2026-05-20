# claude-scaffolding

Portable Claude Code configuration: 11 agents, 31 skills, 13 commands, 8 hooks,
spec-driven workflows. Installs as a Claude Code plugin.

## Overview

`claude-scaffolding` is a portable, markdown-only Claude Code configuration. It
provides multi-agent orchestration, a library of reusable skills, guardrail
hooks, and spec-driven workflows — everything ships as plain markdown and runs
entirely on the Claude Code runtime, with no backend, database, or
long-running process required.

## Why use this

<!-- TODO: add demo.gif showing an agent workflow -->

- **Spec-driven workflows** — OpenSpec-style specs keep work grounded and reproducible.
- **11 specialized agents** — analyst, architect, developer, reviewer, debugger, and more, each with a focused role.
- **Parallel multi-agent orchestration** — fan out work across agents and coordinate results.
- **Opinionated guardrail hooks** — 8 safety and lifecycle hooks block destructive commands and enforce conventions.
- **Zero backend required** — pure markdown and Claude Code runtime; no database, server, or process to run.

## Install

```
1. /plugin marketplace add komluk/scaffolding
2. /plugin install scaffolding@komluk-scaffolding
3. /reload-plugins                       ← REQUIRED: Claude Code does not hot-reload the agent registry
```

Optionally, run `/init-scaffolding` once per project to create `.scaffolding/`
and copy `CLAUDE.md` into the repo (see [Per-project setup](#per-project-setup-init-scaffolding)).
Then start delegating: `Task(subagent_type="scaffolding:developer", prompt="...")`.

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
├── commands/       13 slash commands: 3 top-level (context, init-openspec,
│                    init-scaffolding) + 10 in `commands/specs/`
│                    (apply, archive, bulk-archive, continue, explore, ff,
│                    new, onboard, sync, verify) — namespaced OpenSpec commands
├── hooks/          8 safety + lifecycle hooks (block-destructive-rm,
│                    block-env-write, pre-commit-validation,
│                    session-start-protocol, ...)
├── templates/      Shared agent reference docs (output-frontmatter schema,
│                    agents/skills overview, responsibility matrix)
├── validators/     Validation scripts (circuit-breaker, validate-agent-output)
├── output-styles/  output-frontmatter definition
├── workflows/      YAML workflow and coordinate definitions
├── CLAUDE.md       Main project prompt
└── settings.json   Hooks + statusline + permissions
```

## Optional backend-dependent features

A few skills have optional features that can use an external backend if one is
available — for example, `semantic-memory-store` can persist embeddings to a
vector store, and `ui-ux-pro-max` can draw on a local dataset. When no such
backend is present, these skills degrade gracefully: the agent skips the
relevant section rather than crashing, and all core functionality continues to
work as pure markdown.

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
