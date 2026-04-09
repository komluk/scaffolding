# Locked-to-project components (Tier C)

These components depend on runtime infrastructure that cannot be shipped as
portable markdown. They stay in the origin repository (`scaffolding.tool`) and
are intentionally excluded from `claude-scaffolding`. Each is documented below with
its rationale and an adoption path.

## Index

| Component | Why not portable | Adoption path |
|-----------|------------------|---------------|
| `semantic-memory` MCP server | Needs Postgres + pgvector + embedding model | See `semantic-memory.md` |
| `semantic-memory-store` skill | Calls into FastAPI backend via bash | See `semantic-memory-store.md` |
| `/workflow` command | Needs FastAPI + Redis + worker process | See `workflow-command.md` |
| `/distill` command | Needs distill CLI + DB | See `distill-command.md` |
| `ui-ux-pro-max` scripts/data | Python CLI + CSV design database | See `ui-ux-pro-max-scripts.md` |

## General principle

`claude-scaffolding` ships only **agent knowledge** (markdown), not **agent runtime**.
If a capability requires a long-running service, a database, or generated code,
it is Tier C by definition.

Every Tier A skill that previously called into Tier C has been updated to
degrade gracefully when the Tier C dependency is missing (see
`skills/ui-ux-pro-max/SKILL.md` Tool Availability section and
`skills/semantic-memory-mcp/SKILL.md` defensive note).
