# Scaffolding v2.8.0 — Promo Drafts

Publication-ready copy for the v2.8.0 release. Pick the section for your channel and paste.

- Repo: https://github.com/komluk/scaffolding
- Release: https://github.com/komluk/scaffolding/releases/tag/v2.8.0

**Install (Claude Code):**

```
1. /plugin marketplace add komluk/scaffolding
2. /plugin install scaffolding@komluk-scaffolding
3. /reload-plugins
```

---

## 1. GitHub one-liner

> Scaffolding v2.8.0 brings spec-driven multi-agent orchestration to Claude Code: 13 specialized agents, 35 skills, 19 commands, and 15 opt-in lifecycle hooks — including per-phase model tiers and cross-model review. Everything is additive, opt-in, and backward-compatible.

---

## 2. Reddit

**Title:** Scaffolding v2.8.0 — spec-driven multi-agent orchestration for Claude Code (13 agents, 35 skills, per-phase model tiers)

**Body:**

Scaffolding is a Claude Code plugin that turns a single coding session into a coordinated team of specialized agents (analyst, architect, developer, reviewer, debugger, and so on) working through a spec-driven workflow with quality gates between phases.

What's new in 2.8.0:

- **13 specialized agents** now, including two new ones: `prompt-engineer` and `mcp-builder`. Backed by 35 skills, 19 commands, and 15 hooks.
- **Per-phase model tiers** — run Opus for plan/design/review and lighter models for the rest. Putting the reviewer on Opus breaks same-model self-review, so you get genuine cross-model review (pairs well with a litellm/aiproxy gateway if you route models that way).
- **Opt-in lifecycle hooks** — soft auto-init, auto-format (ruff/black/prettier/dotnet), a Stop completion-nudge, a hard block-subagent guard, and a file-size warning. All default-safe.
- **Context controls** — fork context for heavy skills, `!command` dynamic injection, a nested-CLAUDE rules scaffolder (`/init-rules`), and experimental agent-teams.
- **`<important>`-emphasized rules** plus softened delegation: trivial Q&A is answered directly, real work gets delegated.

Why it matters: the value of multi-agent setups usually leaks away through same-model blind spots and rigid orchestration. 2.8.0 leans on per-phase tiers and cross-model review to catch what a single model misses, while keeping every new behavior opt-in so nothing changes until you turn it on.

Install (Claude Code):

```
1. /plugin marketplace add komluk/scaffolding
2. /plugin install scaffolding@komluk-scaffolding
3. /reload-plugins
```

Repo: https://github.com/komluk/scaffolding
Release notes: https://github.com/komluk/scaffolding/releases/tag/v2.8.0

Everything in this release is additive and backward-compatible — upgrade, and your existing setup keeps working.

---

## 3. Discord

> **Scaffolding v2.8.0 is out** 🚀
>
> Spec-driven multi-agent orchestration for Claude Code — now **13 agents** (new: `prompt-engineer` + `mcp-builder`), **35 skills**, **19 commands**, **15 hooks**.
>
> ✨ Per-phase model tiers (Opus for plan/design/review) + cross-model review
> 🪝 Opt-in lifecycle hooks: auto-format, completion-nudge, subagent guard
> 🧩 Context forking, `!command` injection, `/init-rules` scaffolder
>
> All additive, all opt-in, fully backward-compatible.
>
> Install: `/plugin marketplace add komluk/scaffolding` → `/plugin install scaffolding@komluk-scaffolding` → `/reload-plugins`
> Release: https://github.com/komluk/scaffolding/releases/tag/v2.8.0

---

## 4. X / Twitter

### (a) Standalone tweet

> Scaffolding v2.8.0 for Claude Code is out 🚀
>
> Spec-driven multi-agent orchestration: 13 agents, 35 skills, 19 commands, 15 hooks.
>
> New: per-phase model tiers + cross-model review (reviewer on Opus). All opt-in, all backward-compatible.
>
> https://github.com/komluk/scaffolding

### (b) Thread

**1/**
Scaffolding v2.8.0 is out — spec-driven multi-agent orchestration for Claude Code.

13 specialized agents, 35 skills, 19 commands, 15 hooks. Everything additive, opt-in, backward-compatible.

https://github.com/komluk/scaffolding

**2/**
Two new agents this release: `prompt-engineer` and `mcp-builder`.

They slot into the same spec-driven workflow — agents hand off through quality gates instead of one model trying to do everything at once.

**3/**
Per-phase model tiers: run Opus for plan/design/review, lighter models elsewhere.

Putting the reviewer on Opus breaks same-model self-review → real cross-model review. Pairs nicely with a litellm/aiproxy gateway.

**4/**
Opt-in lifecycle hooks, all default-safe:

• soft auto-init
• auto-format (ruff/black/prettier/dotnet)
• Stop completion-nudge
• hard block-subagent guard
• file-size warn

**5/**
Context controls: fork context for heavy skills, `!command` dynamic injection, a nested-CLAUDE rules scaffolder (`/init-rules`), and experimental agent-teams.

Plus `<important>`-emphasized rules + softened delegation: trivial Q&A direct, real work delegated.

**6/**
Install in Claude Code:

```
/plugin marketplace add komluk/scaffolding
/plugin install scaffolding@komluk-scaffolding
/reload-plugins
```

Release notes: https://github.com/komluk/scaffolding/releases/tag/v2.8.0
