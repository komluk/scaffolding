# Changelog

## v0.1.0 (2026-04-09)

Initial migration from `scaffolding.tool` phase A (steps 1-5 of proposal).

### Added
- 11 agents (analyst, architect, coordinator, debugger, developer, devops,
  gitops, performance-optimizer, researcher, reviewer, tech-writer)
- 30 skills (agent-memory, api-design, error-handling, pattern-recognition,
  python-patterns, mui-styling, testing-strategy, spec-design, spec-develop,
  spec-workflow, ui-ux-pro-max, semantic-memory-mcp, ...)
- 4 commands (context, execute-prp, generate-prp, init-openspec)
- 7 hooks (block-destructive-rm, block-env-write, block-force-push,
  file-staleness-check, file-staleness-update, post-edit-review,
  pre-commit-validation)
- 4 templates (base, planning, spec) + 2 validators
- 1 output-style (output-frontmatter) + 2 YAML workflows
- `install.sh` with 6 `__CLAUDE_HOME_*__` placeholders and auto-detect
- `uninstall.sh` for clean removal
- `.claude-home.env.example`
- MIT license
- Polish README + CHANGELOG + docs

### Not included (Tier C, see docs/locked-to-project/)
- `/workflow` command (requires FastAPI backend)
- `/distill` command (requires distill/cli.py)
- `semantic-memory` MCP server (requires Postgres + pgvector)
- `semantic-memory-store` skill (requires backend bash calls)
- `ui-ux-pro-max` scripts/ + data/ (markdown is included with graceful degradation)

### Known limitations
- Some skills reference Tier C tooling defensively -- they fall back to
  markdown-only guidance if the underlying scripts/services are absent.
- No automated tests in the repo itself. Validation is done via `install.sh`
  idempotency check (`--refresh` twice -> bit-identical output).
