# Contributing

## Project Structure

The plugin organizes orchestration logic into four core directories:

- **`agents/`** (13 agents) — Each `.md` file defines one agent with YAML frontmatter (`name`, `description`, `model`, `effort`, `skills`, `disallowedTools`), then agent-specific guidance. Example: `agents/developer.md` (sonnet/high, can use Edit/Write), `agents/tech-writer.md` (haiku, read-only).

- **`skills/`** (36 skills) — Directory per skill with `SKILL.md` frontmatter (`name`, `description`) and content. Skills auto-invoke based on trigger keywords in agent descriptions. Examples: `error-handling/SKILL.md` (guidelines for exception handling), `spec-develop/SKILL.md` (how to build to spec).

- **`commands/`** (19 commands) — 9 top-level slash commands (`/context`, `/learn`, `/memory`, etc.) + 10 OpenSpec subcommands (`/specs new`, `/specs apply`). Each `.md` file is runnable as a Claude Code command.

- **`hooks/`** (15 hooks) — Bash scripts in `hooks/` registered in `.claude-plugin/plugin.json` (PreToolUse, PostToolUse, SessionStart, etc.). Examples: `block-subagent.sh` (hard-deny `general-purpose`), `pre-commit-validation.sh` (framework-agnostic test runner).

## Local Testing

1. Install the plugin from the local repo:
   ```bash
   /plugin install ./  # from this repo directory
   /reload-plugins
   ```

2. Create a test project and initialize:
   ```bash
   mkdir test-project && cd test-project
   /init-scaffolding
   ```

3. Verify routing works:
   ```bash
   Task(subagent_type="scaffolding:developer", prompt="test")
   ```

4. Run validation:
   ```bash
   npm test  # or ./validate.sh if present
   ```

## Release Process

### Version Bumping

Follow [SemVer 2.0.0](https://semver.org/):
- **MAJOR** (`X.0.0`) — Breaking changes (removing agent/skill/command, schema changes)
- **MINOR** (`x.Y.0`) — New agent/skill/command/hook (backward compatible)
- **PATCH** (`x.y.Z`) — Bug fixes, typo, doc tweaks

Source of truth: `.claude-plugin/plugin.json` (`version` field).

### Release Checklist

**CRITICAL:** Before releasing, verify counts are synchronized:

1. **Count verification** (must stay in sync):
   - Count agents in `agents/*.md` → should match `plugin.json` / `README.md` / `CLAUDE.md` ("13 agents")
   - Count skills in `skills/*/SKILL.md` → should match "36 skills"
   - Count commands: `commands/*.md` (9 top-level) + `commands/specs/*.md` (10) = 19 total
   - Count hooks in `hooks/*.sh` → should match "15 hooks"

2. **File updates:**
   - Update `.claude-plugin/plugin.json` → `version` field
   - Update `README.md` line ~5 (badge + description)
   - Update `CHANGELOG.md` with new section (`## [X.Y.Z] - YYYY-MM-DD`)

3. **Tag & push:**
   - `git tag v${version}` (e.g., `v2.10.1`)
   - `git push origin main && git push origin v${version}`
   - GitHub Actions automatically creates Release with tag

4. **Validate:**
   - Run `npm test` or equivalent validation script
   - Spot-check `/reload-plugins` + `/init-scaffolding` in a test project

## Contributing

- **Good first issues:** Look for `good-first-issue` label in GitHub Issues
- **Help wanted:** Tasks tagged `help-wanted` are open for contributions
- **Agent/skill proposals:** Open a GitHub Discussion before writing; confirm scope with maintainer

For security issues, email privately rather than opening a public issue.

## Style Guide

- Keep agent/skill frontmatter descriptions **concise** (one sentence)
- Use **exact** agent names in routing (e.g., `scaffolding:developer`, not `developer`)
- Bash scripts use `set -euo pipefail` for safety
- Markdown always has an H1 heading
