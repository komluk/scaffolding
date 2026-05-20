# Promotional Posts — claude-scaffolding v2.2.0

> **For the maintainer:** These are *drafts*. Nothing here is auto-posted. Post each
> one yourself, and review each community's self-promotion rules first (Reddit
> subreddits and the Anthropic Discord both restrict promo posts — space them out and
> engage with replies). Attach `demo.gif` where the platform supports media (Reddit,
> X, Discord all do). Tweak tone/wording so it reads as your own voice.

---

## Reddit — r/ClaudeAI

**Title:**

> I built a Claude Code plugin for structured multi-agent workflows — 11 specialized agents, auto-routing, spec-driven (v2.2.0)

**Body:**

```markdown
If you use Claude Code for non-trivial work, you've probably noticed it does
everything as one generalist context: planning, coding, reviewing, docs, git — all
mixed together. It works, but there's no separation of concerns and no consistent
process.

claude-scaffolding is a plugin that fixes that. It turns Claude Code into a small
team of specialized agents that hand work off to each other:

- **11 agents** — analyst, architect, researcher, developer, debugger, reviewer,
  optimizer, tech-writer, devops, gitops, coordinator
- **Auto-routing** — every request is routed to the right agent (bug → debugger →
  developer; feature → analyst → architect → developer; etc.)
- **32 skills + 15 commands + 8 hooks** for common workflows
- **Spec-driven** — OpenSpec-style specs so multi-step work stays grounded
- **Quality gates** — reviewer blocks on criticals, researcher needs a score
  threshold, etc.
- Pure plugin, **no backend** — nothing to host

Install:

    /plugin marketplace add komluk/scaffolding
    /plugin install scaffolding@komluk-scaffolding
    /reload-plugins

Repo (MIT, public): https://github.com/komluk/scaffolding

Still actively iterating — would genuinely like feedback on the agent set and the
routing rules. What's missing? What would you route differently?
```

---

## Anthropic Discord — #share-your-projects

```
Just shipped claude-scaffolding v2.2.0 — a Claude Code plugin that turns Claude into
a coordinated team of 11 specialized agents (developer, reviewer, architect, gitops,
…) with automatic routing and quality gates. Spec-driven, 32 skills / 15 commands /
8 hooks, no backend to run.

Install:
  /plugin marketplace add komluk/scaffolding
  /plugin install scaffolding@komluk-scaffolding
  /reload-plugins

Repo: https://github.com/komluk/scaffolding
Demo GIF attached 👇 — feedback very welcome!
```

---

## X / Twitter

**Single post (under 280 chars):**

```
Shipped claude-scaffolding v2.2.0 — a Claude Code plugin that turns Claude into a
team of 11 specialized agents with auto-routing + quality gates. Spec-driven, no
backend.

/plugin marketplace add komluk/scaffolding

github.com/komluk/scaffolding
```

**Thread version (if you want more room):**

```
1/ Claude Code is great, but it does planning, coding, review, docs & git all in one
generalist context. I wanted real separation of concerns.

So I built claude-scaffolding — a plugin v2.2.0. 🧵

2/ It turns Claude Code into 11 specialized agents — analyst, architect, developer,
debugger, reviewer, optimizer, tech-writer, devops, gitops, coordinator + a router.

Every request auto-routes to the right one.

3/ Bug → debugger → developer.
Feature → analyst → architect → developer → reviewer.
Each handoff has quality gates (reviewer blocks on criticals, etc.).

Plus 32 skills, 15 commands, 8 hooks. Spec-driven. No backend.

4/ Install in three lines:

/plugin marketplace add komluk/scaffolding
/plugin install scaffolding@komluk-scaffolding
/reload-plugins

5/ MIT-licensed and public. Actively iterating — feedback on the agent set + routing
rules very welcome.

github.com/komluk/scaffolding
```

Attach `demo.gif` to tweet 1/ (or the single post).
