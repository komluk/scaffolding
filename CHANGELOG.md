# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.1] - 2026-04-22

### Fixed
- `install.sh:107` — guard `${#CONFIG[@]}` check with `${CONFIG[*]+x}` presence test. Prevents `CONFIG: unbound variable` error on bash 5.x when `declare -A CONFIG` receives no keys (triggered by `--refresh` against a missing config file).

## [1.7.0] - 2026-04-22

### Fixed
- `install.sh:107` — guard empty `CONFIG` associative array under `set -u` (fixes `./install.sh --refresh` crash on bash 5.x)
- `.github/workflows/validate.yml` — align CI env file path with `install.sh` (`.scaffolding.env` → `.claude-scaffolding.env`)

### Changed
- **Cross-repo alignment with `scaffolding.tool`** (2026-04-22): canonicalized
  agent names, skill set, and command surface so plugin and origin repo report
  identical totals.
  - Renamed plugin agent `performance-optimizer` to `optimizer` so both repos
    share the canonical name (matches the routing table in `CLAUDE.md`).
  - Synced the `semantic-memory-store` skill into the plugin's skill set
    (31 skills total; the skill retains its defensive fallback when the
    FastAPI backend is unreachable, per the Tier C policy).
  - Added output-frontmatter to slash commands that were missing it, so
    guardrails can parse agent output consistently across both repos.
  - Fixed component counts across `plugin.json`, `README.md`, and
    `CLAUDE.md`: **31 skills, 11 agents, 15 commands** (5 top-level +
    10 `commands/specs/`).

### Added
- `SessionStart` hooks with `startup` and `resume` matchers that inject the full
  routing protocol (blocked subagent types, mandatory behavior, all 11 agents,
  decision tree, delegation format) on every new and resumed session. Fixes the
  problem where Claude ignores agents and skills in projects installed via
  `/plugin install` because the plugin's `CLAUDE.md` is not in `$CWD`.
- `hooks/session-start-protocol.sh`: new dedicated script that outputs the
  routing protocol via JSON `hookSpecificOutput.additionalContext` format.
  This is the correct mechanism per Claude Code hook docs — plain `echo` text
  is treated as low-priority debug context; `additionalContext` in JSON output
  is injected at full system-context weight. Both `startup` and `resume`
  matchers now call this script instead of inline `echo` commands.
- `/init-scaffolding` slash command for the marketplace-install flow:
  detects the plugin directory and copies `CLAUDE.md` + `settings.json` into the
  current project (no overwrite). Closes the gap between plugin install and
  `install.sh --target` flows.

### Changed
- README: added prominent note explaining the two install flows and why
  `/init-scaffolding` must be run after `/plugin install` to get `CLAUDE.md`
  into the target repo.
- **Prefixed all agent `subagent_type` references** with `scaffolding:` as the
  canonical form throughout `CLAUDE.md`, `hooks/session-start-protocol.sh`,
  `agents/architect.md`, and `docs/locked-to-project/workflow-command.md`. Fixes
  "Agent type 'developer' not found" errors when the plugin is installed via the
  marketplace (`/plugin install scaffolding@komluk-scaffolding`) and agents
  are loaded under the `scaffolding:` namespace.
- `install.sh`: added Step 3 that strips the `scaffolding:` prefix from all
  rendered `.md` and `.sh` files in the target directory when `--target` differs from
  the repo root. The copy-to-target flow produces bare names (e.g. `developer`)
  as before; only the plugin flow uses the prefixed form.
- README: added "Przestrzen nazw agentow: Plugin vs install.sh" subsection documenting
  both forms and explaining that `install.sh` handles the conversion automatically.

---

> **Note:** 2026-04-09 -- Project renamed from `claude-home` to
> `claude-scaffolding`. Repository URL, marketplace name, plugin name, env
> file, and placeholder prefix (`__CLAUDE_HOME_*__` -> `__CLAUDE_SCAFFOLDING_*__`)
> all updated. Historical mentions of "claude-home" in this file are preserved
> for traceability.
>
> **Note:** 2026-04-10 -- Project renamed from `claude-scaffolding` to
> `scaffolding`. Repository URL updated to `komluk/scaffolding`, command renamed
> from `/init-claude-scaffolding` to `/init-scaffolding`, env file renamed from
> `~/.scaffolding.env` to `~/.scaffolding.env`.

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
  users keep full parametrization via `~/.scaffolding.env`
- Semver + automatic GitHub Releases on `v*` tag push, with `install.sh`,
  `uninstall.sh`, and `.scaffolding.env.example` attached as assets
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
  `~/.scaffolding.env` are still honored, idempotency is preserved
- Phase B users: install with
  ```
  /plugin marketplace add komluk/scaffolding
  /plugin install scaffolding@komluk-scaffolding
  ```
  Because `komluk/scaffolding` is a **private** repository, the Claude Code
  CLI must be authenticated via `gh auth login` with `repo` scope before
  running the marketplace add command
- Both flows coexist; pick one per machine, do not mix
- Plugin components are loaded under the `scaffolding:*` namespace (e.g.
  `scaffolding:developer`, `/scaffolding:workflow`)

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
- `.scaffolding.env.example`
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
