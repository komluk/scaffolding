# Orchestration Pattern: Command → Agent → Skill

This document codifies the three-layer orchestration convention the scaffolding
plugin already follows implicitly. It is documentation/convention only — there is
no runtime mechanism change. The goal is to make the existing behavior
intentional and reviewable.

## The three roles

| Layer | Lives in | Responsibility | Does NOT |
|-------|----------|----------------|----------|
| **Command** | `commands/*.md` | Orchestration entry point: parse args, own the UI/UX, sequence agents, print the final report. | Implement domain logic; encode reusable methodology. |
| **Agent** | `agents/*.md` | Do the work for one role. Preloads its always-needed skills via `skills:` frontmatter; invokes situational skills on demand. | Own arg parsing or cross-agent sequencing (that is the command/coordinator). |
| **Skill** | `skills/*/SKILL.md` | A single reusable methodology Claude can auto-invoke. | Orchestrate agents or own UI. |

Flow: a **command** routes to one or more **agents**; each **agent** carries a
set of **skills** (preloaded or invoked) that supply the methodology.

## Preloaded vs invoked — the decision rule

A skill reaches an agent's context in one of two ways:

- **Preloaded** — listed in the agent's `skills:` frontmatter (e.g.
  `agents/coordinator.md` preloads `agent-memory`, `semantic-memory-mcp`,
  `agent-comms`). In context from turn one, every task.
- **Invoked** — auto-loaded on demand when the task matches the skill's
  `description:` `TRIGGER`/`SKIP` clause (e.g. `worktree-management`,
  `context-engineering`).

**Decision rule:**

> **Preload** a skill in agent frontmatter when the agent needs it on **nearly
> every task** it runs. **Leave it invoked** (via a precise `TRIGGER`/`SKIP`
> `description:`) when it is **situational**.

Rationale and guardrails:

- `skills:` frontmatter is a **preloaded contract**: it is the set of
  methodologies an agent is guaranteed to carry. Treat additions as a context-budget
  decision, not a convenience.
- Over-preloading inflates every task's context. Respect the
  `context-engineering` budget (**skills < 300 tokens each**); preload only
  high-frequency skills.
- Invoked skills MUST carry a precise `description:` with `TRIGGER`/`SKIP` (see
  `skill-authoring`) so they fire on the right tasks and not the wrong ones.
- When in doubt, prefer **invoked** — under-triggering a situational skill is
  cheaper than paying its tokens on every unrelated task.

## Forked — the third delivery mode

A third way a skill can reach work is **forked**: a skill with `context: fork`
in its frontmatter runs in an isolated subagent so its large body never pollutes
the main thread's context.

| Mode | Mechanism | Use when |
|------|-----------|----------|
| **Preloaded** | Agent `skills:` frontmatter — in context from turn one. | Needed on nearly every task. |
| **Invoked** | Auto-loaded on demand via `description:` `TRIGGER`/`SKIP`. | Situational. |
| **Forked** | Skill `context: fork` (+ optional `agent:`) — runs in an isolated subagent. | **Heavy AND one-shot** reference skills (e.g. `ui-ux-pro-max`, `mui-styling`). |

Fork only heavy, one-shot reference skills; never iterative ones
(`testing-strategy`, `pattern-recognition`) that need the live main context. See
`skill-authoring` for the full fork rule.

## Validation

The `/doctor` command validates this contract:

- every skill named in any agent's `skills:` frontmatter exists on disk, and
- every `skills/*/SKILL.md` has a non-empty `description:`.

A doc that drifts from the actual frontmatter is worse than no doc; the doctor
check keeps them honest.
