# /workflow command

## What it is

The `/workflow` slash command triggers a multi-agent pipeline (analyst ->
researcher -> architect -> developer -> reviewer -> tech-writer -> gitops)
orchestrated by a FastAPI backend in the origin repo. It reads
`.claude/workflows/*.yaml` to find the workflow definition, spawns Claude CLI
subprocesses for each step, and tracks progress in Postgres + Redis.

## Why not in claude-scaffolding

The command entry point is a markdown file that references
`app/backend/workflows/cli_helper.py`. That helper requires:

- **FastAPI backend** running locally
- **Redis** for task queue
- **Postgres** for step event persistence
- **Worker process** that consumes the queue

All four are Tier C runtime dependencies and have no meaning in a repo that is
just using Claude Code as a CLI assistant.

## How to enable in your project

Two options:

### Option A -- clone the origin backend

Run the entire `scaffolding.tool` stack (FastAPI + Postgres + Redis + worker
on Systemd or Docker) alongside your project. This gives you `/workflow`
plus the UI. Overkill for most users.

### Option B -- manual agent sequencing

Without `/workflow`, you can still orchestrate agents manually using the
`Task` tool directly. Example sequence for a feature:

```
Task(subagent_type="analyst", prompt="...")       # writes proposal.md
Task(subagent_type="architect", prompt="...")     # writes design.md + tasks.md
Task(subagent_type="developer", prompt="...")     # implements
Task(subagent_type="reviewer", prompt="...")      # reviews
Task(subagent_type="tech-writer", prompt="...")   # updates docs
Task(subagent_type="gitops", prompt="...")        # commits and pushes
```

This is what the `CLAUDE.md` Decision Tree documents as the fallback.

## Shipped alternatives

`claude-scaffolding` still includes `coordinator` agent which can LLM-plan a
dynamic multi-step pipeline without the backend; this is the Tier A
alternative to `/workflow`.
