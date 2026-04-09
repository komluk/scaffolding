# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> **Note:** 2026-04-09 -- Project renamed from `claude-home` to
> `claude-scaffolding`. Repository URL, marketplace name, plugin name, env
> file, and placeholder prefix (`__CLAUDE_HOME_*__` -> `__CLAUDE_SCAFFOLDING_*__`)
> all updated. Historical mentions of "claude-home" in this file are preserved
> for traceability.

## [1.0.0] - 2026-04-09

### Added
- Native Claude Code plugin support via `.claude-plugin/plugin.json`
- Self-referential marketplace manifest `.claude-plugin/marketplace.json`
  (marketplace name: `komluk-scaffolding`)
- CI/CD GitHub Actions workflows: `validate.yml` (JSON/YAML/bash lints,
  placeholder sanity, install idempotency) and `release.yml` (tag-to-release
  automation with version match enforcement)
- Pre-rendered sensible defaults for the 6 `__CLAUDE_SCAFFOLDING_*__` placeholders
  (Strategy C hybrid): plugin users get a zero-config install; `install.sh`
  users keep full parametrization via `~/.claude-scaffolding.env`
- Semver + automatic GitHub Releases on `v*` tag push, with `install.sh`,
  `uninstall.sh`, and `.claude-scaffolding.env.example` attached as assets
- README sections documenting both install flows (plugin + clone+install.sh)
  and when to pick each

### Changed
- `install.sh` uses a template-to-destination model: sources are pulled from
  `templates/*.tmpl` (canonical placeholder form) and rendered into `--target`,
  rather than in-place substitution on the destination tree
- README restructured with "Option A (Plugin)" and "Option B (Clone)" sections
- CHANGELOG migrated to [Keep a Changelog](https://keepachangelog.com/) format

### Migration notes (Phase A to Phase B)
- Phase A users: `./install.sh --target ~/.claude` still works; env vars in
  `~/.claude-scaffolding.env` are still honored, idempotency is preserved
- Phase B users: install with
  ```
  /plugin marketplace add komluk/claude-scaffolding
  /plugin install claude-scaffolding@komluk-scaffolding
  ```
  Because `komluk/claude-scaffolding` is a **private** repository, the Claude Code
  CLI must be authenticated via `gh auth login` with `repo` scope before
  running the marketplace add command
- Both flows coexist; pick one per machine, do not mix
- Plugin components are loaded under the `claude-scaffolding:*` namespace (e.g.
  `claude-scaffolding:developer`, `/claude-scaffolding:workflow`)

### Components shipped
- 30 skills, 11 agents, 14 commands (4 general + 10 spec), 7 hooks
- 4 templates, 2 validators, 1 output-style, 2 YAML workflow definitions

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
- `install.sh` with 6 `__CLAUDE_SCAFFOLDING_*__` placeholders and auto-detect
- `uninstall.sh` for clean removal
- `.claude-scaffolding.env.example`
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
