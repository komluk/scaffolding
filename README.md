# claude-scaffolding

[![Version](https://img.shields.io/badge/version-2.7.1-blue?style=flat-square)](https://github.com/komluk/scaffolding/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE) [![Works with Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-8A2BE2?style=flat-square)](https://github.com/komluk/scaffolding) [![Agents](https://img.shields.io/badge/agents-11-orange?style=flat-square)](agents/) [![Skills](https://img.shields.io/badge/skills-35-orange?style=flat-square)](skills/) [![Commands](https://img.shields.io/badge/commands-18-orange?style=flat-square)](commands/) [![Listed on ClaudePluginHub](https://www.claudepluginhub.com/badge/komluk-scaffolding)](https://www.claudepluginhub.com/plugins/komluk-scaffolding?ref=badge)

Portable Claude Code configuration: 11 agents, 35 skills, 18 commands, 9 hooks,
spec-driven workflows. Installs as a Claude Code plugin.

## Overview

`claude-scaffolding` is a portable, markdown-only Claude Code configuration. It
provides multi-agent orchestration, a library of reusable skills, guardrail
hooks, and spec-driven workflows — everything ships as plain markdown and runs
entirely on the Claude Code runtime, with no backend, database, or
long-running process required.

## Why use this

- **Spec-driven workflows** — OpenSpec-style specs keep work grounded and reproducible.
- **11 specialized agents** — analyst, architect, developer, reviewer, debugger, and more, each with a focused role.
- **Parallel multi-agent orchestration** — fan out work across agents and coordinate results.
- **Opinionated guardrail hooks** — 9 safety and lifecycle hooks block destructive commands and enforce conventions.
- **Extensible & self-improving** — `/create-skill` scaffolds your own scaffolding-compatible skills, and `/learn` closes the loop by distilling reusable insights from finished conversations.
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

The installed plugin lives under `~/.claude/plugins/` — primarily in the
versioned `cache/komluk-scaffolding/` subtree, with
`marketplaces/komluk-scaffolding/` as the marketplace clone.
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

## Agent memory

Agents share a file-based, 3-tier memory protocol — all plain markdown under
`.scaffolding/` of the project. Memory is auto-injected into an agent's context
when a task starts: shared tier always, agent tier when the agent name is known,
conversation tier when a `conversation_id` is provided. Each file is capped at
200 lines. Read-only agents (architect, reviewer) cannot write memory — they
report findings in their output instead. This protocol is the always-on
default; an optional **cross-device semantic memory** backend adds vector recall
on top — enable it per device with `/memory enable` (see
*[Optional backend-dependent features](#optional-backend-dependent-features)*).

| Tier | File | Scope |
|------|------|-------|
| Shared | `.scaffolding/agent-memory/shared/KNOWLEDGE.md` | Whole-project facts, written/read by any agent |
| Agent | `.scaffolding/agent-memory/agents/{agent-name}/MEMORY.md` | Per-agent domain knowledge |
| Conversation | `.scaffolding/conversations/{conversation_id}/agent-memory/context.md` | Per-conversation context and handoffs |

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
├── skills/         35 skills (api-design, error-handling, pattern-recognition,
│                    skill-authoring, spec-*, mui-styling, python-patterns,
│                    sofa-search, testing-strategy, ...)
├── commands/       18 slash commands: 8 top-level (context, create-skill,
│                    init-openspec, init-scaffolding, learn, memory, doctor,
│                    sofa) + 10 in `commands/specs/` (apply, archive,
│                    bulk-archive, continue, explore, ff, new, onboard, sync,
│                    verify) — namespaced OpenSpec commands
├── hooks/          9 safety + lifecycle hooks (block-destructive-rm,
│                    block-env-write, pre-commit-validation,
│                    session-start-protocol, memory-project-id, ...)
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

### Cross-device semantic memory (`/memory`)

The `semantic-memory-mcp` / `semantic-memory-store` skills can be backed by a
self-hosted [mem0](https://github.com/mem0ai/mem0) service (PostgreSQL + pgvector,
with a local LLM and embeddings via [Ollama](https://ollama.com)). When enabled,
agents persist and recall insights across sessions **and devices** through
`semantic_search` / `semantic_recall` / `semantic_store`, on top of the always-on
file-based memory.

It is **opt-in and personal**:

```
/memory enable     # wire the backend into Claude Code (user scope) — run once per device
/memory disable    # disconnect this device (stored memories are kept)
/memory status     # show whether it's wired and reachable
```

- **Off by default.** Nothing connects until you run `/memory enable`. Installing
  the plugin without a backend simply runs without semantic memory.
- **Token-gated.** Auth uses a personal bearer token (`MEMORY_MCP_TOKEN`); the
  endpoint defaults to your own backend and is overridable via `MEMORY_MCP_URL`.
- **Per-project isolation.** The `memory-project-id` SessionStart hook derives a
  stable `project_id` from the git remote, so each repository has its own memory
  namespace, shared across your devices.
- **Graceful fallback.** If the backend is unreachable, skills fall back to the
  file-based `.scaffolding/agent-memory/` — agents never block.

Hosting the backend (LXC/VM, Docker compose, Ollama, network egress policy) is
outside the plugin; the plugin only consumes the MCP endpoint.

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
