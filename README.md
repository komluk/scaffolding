# claude-scaffolding

[![Version](https://img.shields.io/badge/version-2.11.1-blue?style=flat-square)](https://github.com/komluk/scaffolding/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE) [![Works with Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-8A2BE2?style=flat-square)](https://github.com/komluk/scaffolding) [![Agents](https://img.shields.io/badge/agents-13-orange?style=flat-square)](agents/) [![Skills](https://img.shields.io/badge/skills-36-orange?style=flat-square)](skills/) [![Commands](https://img.shields.io/badge/commands-19-orange?style=flat-square)](commands/) [![Listed on ClaudePluginHub](https://www.claudepluginhub.com/badge/komluk-scaffolding)](https://www.claudepluginhub.com/plugins/komluk-scaffolding?ref=badge)

Portable Claude Code configuration: 13 agents, 36 skills, 19 commands, 15 hooks,
spec-driven workflows. Installs as a Claude Code plugin.

## Overview

`claude-scaffolding` is a portable, markdown-only Claude Code configuration. It
provides multi-agent orchestration, a library of reusable skills, guardrail
hooks, and spec-driven workflows — everything ships as plain markdown and runs
entirely on the Claude Code runtime, with no backend, database, or
long-running process required.

## Why use this

- **Spec-driven workflows** — OpenSpec-style specs keep work grounded and reproducible.
- **13 specialized agents** — analyst, architect, developer, reviewer, debugger, prompt-engineer, mcp-builder, and more, each with a focused role.
- **Parallel multi-agent orchestration** — fan out work across agents and coordinate results.
- **Opinionated guardrail hooks** — 15 safety and lifecycle hooks block destructive commands, hard-deny disallowed subagents, and enforce conventions.
- **Extensible & self-improving** — `/create-skill` scaffolds your own scaffolding-compatible skills, and `/learn` closes the loop by distilling reusable insights from finished conversations.
- **Zero backend required** — pure markdown and Claude Code runtime; no database, server, or process to run.

## What's new in 2.8.0

Everything below is **opt-in or default-safe** — existing installs behave exactly
as before until you set a flag or invoke a new agent. See the [CHANGELOG](CHANGELOG.md)
for the full list.

- **Two new agents (roster 11 → 13):** **`prompt-engineer`** (system prompts,
  guardrail rules, prompt evals, LLM-judge rubrics, injection defense) and
  **`mcp-builder`** (design/build/test MCP servers, tool schemas, transport, auth
  launchers).
- **Six new hooks:** soft auto-init advice (`auto-init-check`), opt-in
  auto-format (`post-edit-format`), opt-in desktop/terminal notifications
  (`notify`), opt-in completion nudge (`completion-nudge`), a hard block on the
  `general-purpose`/`explore` subagents (`block-subagent`), and a warn-only
  >500-line file check (`file-size-warn`).
- **Per-phase model tiers:** `analyst`, `architect`, and `reviewer` declare
  `model: opus` + `effort: high`; `developer` stays `inherit`. The reviewer on a
  higher tier breaks same-model self-review and records a `cross_model` flag in
  its report. The plugin emits only literal `sonnet`/`opus`/`haiku`; backend
  mapping lives on the aiproxy/litellm side — see [docs/model-tiers.md](docs/model-tiers.md).
- **`/init-rules` command:** scaffolds opt-in, path-scoped nested `CLAUDE.md`
  rule files so per-area conventions lazy-load only where relevant, while routing
  stays always-loaded.
- **Lighter routing prompt:** critical rules emphasized with `<important>`, and
  forced delegation softened so trivial Q&A may be answered directly while real
  engineering work is still delegated.
- **Skill performance:** `context: fork` on four heavy skills (`ui-ux-pro-max`,
  `mui-styling`, `logging-standards`, `monitoring-observability`) and
  `` !`command` `` dynamic injection in the git/worktree/context-engineering skills.
- **Experimental agent-teams mode** behind `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
  — see [docs/agent-teams.md](docs/agent-teams.md).

### Opt-in flags

All flags are **off by default**; the plugin's behavior is unchanged unless you set them.

| Flag | Default | Effect |
|------|---------|--------|
| `SCAFFOLDING_AUTOFORMAT` | off | `=1` enables `post-edit-format.sh` — auto-formats the single edited file (ruff/black, prettier, `dotnet format`); never blocks. |
| `SCAFFOLDING_NOTIFY` | off | `=1` enables `notify.sh` — desktop/terminal notification on turn-finish or input-needed. |
| `SCAFFOLDING_COMPLETION_NUDGE` | off | `=1` advisory nudge to finish the delegation chain; `=block` enforces it (loop-guarded). |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | off | `=1` enables the experimental agent-teams mode (see [docs/agent-teams.md](docs/agent-teams.md)). |

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
├── agents/         13 agents (analyst, architect, coordinator, developer,
│                    debugger, devops, gitops, mcp-builder, optimizer,
│                    prompt-engineer, researcher, reviewer, tech-writer)
├── skills/         36 skills (api-design, error-handling, pattern-recognition,
│                    skill-authoring, spec-*, mui-styling, python-patterns,
│                    sofa-search, testing-strategy, watch-patterns, ...)
├── commands/       19 slash commands: 9 top-level (context, create-skill,
│                    init-openspec, init-rules, init-scaffolding, learn, memory,
│                    doctor, sofa) + 10 in `commands/specs/` (apply, archive,
│                    bulk-archive, continue, explore, ff, new, onboard, sync,
│                    verify) — namespaced OpenSpec commands
├── hooks/          15 safety + lifecycle hooks (block-destructive-rm,
│                    block-subagent, block-env-write, pre-commit-validation,
│                    post-edit-format, completion-nudge, file-size-warn, notify,
│                    session-start-protocol, auto-init-check, memory-project-id, ...)
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
- [docs/orchestration-pattern.md](docs/orchestration-pattern.md) —
  the multi-agent orchestration pattern
- [docs/model-tiers.md](docs/model-tiers.md) —
  per-phase model tiers, cross-model review, and the aiproxy/litellm mapping contract
- [docs/agent-teams.md](docs/agent-teams.md) —
  experimental agent-teams mode (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
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
