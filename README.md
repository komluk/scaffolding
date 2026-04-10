# claude-scaffolding

Give Claude Code 11 specialized agents, 30 skills, safety hooks, and auto-routing — in one install.

Instead of Claude answering everything directly, it routes your messages to the right specialist:

> You say "fix the login bug" → Claude auto-routes to **debugger** → debugger investigates → **developer** fixes it.

No special commands. Just talk normally.

---

## Get started in 30 seconds

**Requirements:** git, python3, Claude Code CLI

### Method A — install.sh (recommended)

```bash
git clone https://github.com/komluk/claude-scaffolding
cd claude-scaffolding
./install.sh --target /path/to/your/project/.claude
```

That's it. Open Claude Code in your project and start talking.

The installer auto-detects your test commands, project name, and other settings. Hit Enter to accept defaults, or customize anything. Your choices are saved to `~/.claude-scaffolding.env` and can be changed later.

---

## Updating

```bash
cd claude-scaffolding
git pull
./install.sh --refresh
```

---

## What's inside

```
11 agents      analyst, architect, researcher, developer, debugger,
               reviewer, performance-optimizer, tech-writer, devops,
               gitops, coordinator

30 skills      api-design, error-handling, pattern-recognition,
               testing-strategy, python-patterns, mui-styling, ...

14 commands    /workflow, /init-openspec, /context, and more

7 hooks        pre-commit validation, block destructive commands,
               block env file writes, ...

2 workflows    workflow  — full 8-step pipeline (analyst → architect → developer → reviewer → ...)
               coordinate — LLM-planned minimal pipeline for everything else
```

### Agents at a glance

| Agent | What it handles |
|-------|----------------|
| analyst | Requirements, feasibility, proposals |
| architect | System design, API design, multi-file planning |
| researcher | External APIs, libraries, best practices |
| developer | Code, bug fixes, features, tests, UI |
| debugger | Errors, unexpected behavior |
| reviewer | Code review, security analysis |
| performance-optimizer | Performance, database, queries |
| tech-writer | README, CHANGELOG, docs |
| devops | CI/CD, deployment, infrastructure |
| gitops | Git operations, commits, merges, push |
| coordinator | Decomposes complex tasks into agent sequences |

---

## What's NOT included

These features need a running backend and are not part of this plugin:

- **Semantic memory MCP** — requires Postgres + pgvector
- **/workflow command** — requires FastAPI + Redis worker
- **/distill command** — requires distill CLI + database

Skills that reference these features degrade gracefully — they skip the unavailable section instead of failing. See [docs/locked-to-project/](docs/locked-to-project/README.md) for details.

---

## License

MIT
