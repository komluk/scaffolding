# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.10.1] - 2026-07-12

### Fixed
- Conditional `WorktreeCreate`/`WorktreeRemove` hooks fall back to in-place execution when the current directory is outside a git repository, eliminating the hard error "Cannot create agent worktree: not in a git repository and no WorktreeCreate hooks are configured." Worktree isolation still applies normally when cwd is inside a repo.

## [2.10.0] - 2026-07-05

Orchestration optimizations: cheaper defaults with explicit escalation paths,
budget-aware planning, and a framework-agnostic pre-commit gate. Minor bump
(additive, backward-compatible).

### Added
- **Escalation rules for haiku agents.** gitops escalates semantic merge
  conflicts to developer and risky history rewrites to architect/user;
  tech-writer escalates architectural or new technical content to a higher
  tier.
- **Budget-aware coordinator.** Accepts a budget hint (`small|medium|large`
  or a token count), produces tier-aware plans with a mandatory `tier_reason`
  for opus steps, and short-circuits trivial tasks into a single developer
  step.
- **Mandatory delegation prompt template in coordinator** (Objective /
  Output / Constraints / Done when).
- **Developer effort-escalation note** — `xhigh` override for large
  multi-file work.

### Changed
- **Reviewer is now two-tier:** default sonnet/high for routine reviews;
  escalation to opus (per-invocation model override) for security-sensitive,
  architectural, or explicitly-requested deep reviews.
- **`hooks/pre-commit-validation.sh` rewritten framework-agnostic.** Detects
  project validation by convention (Makefile, justfile, package.json +
  lockfile-detected package manager, pytest, cargo, go, composer,
  gradle/maven) and runs the first match; warns and passes when none is
  found. Plugin repos additionally run the skill + agent-frontmatter
  validators.
- **Prescriptive agent descriptions:** analyst explicitly excludes small
  clear-scope changes; developer is the direct target for them.

## [2.9.0] - 2026-07-05

Model tiering across the roster: opus = analysis, sonnet = build, haiku =
mechanical. Minor bump (additive, backward-compatible).

### Added
- **Explicit model tiers for all 13 agents.** Every agent now pins `model` +
  `effort` in frontmatter (previously 10 used `model: inherit`): opus/high =
  analyst, architect, debugger, reviewer; sonnet/high = developer, optimizer,
  mcp-builder, prompt-engineer; sonnet/medium = devops, researcher;
  sonnet/low = coordinator; haiku (no effort) = gitops, tech-writer.
- **`validators/validate-agent-frontmatter.sh`** — validates the model/effort
  whitelist and enforces that haiku agents must not set `effort`.
- **Optional `complexity` input in `workflow.yaml`.** `complexity: small`
  skips propose/research/design and runs a direct implement step.
- **Tier column** added to the agents table in `CLAUDE.md`.

### Changed
- **`CLAUDE.md` decision tree:** small-change fast-path routes straight to
  developer; default routing no longer sends everything to analyst.

## [2.8.0] - 2026-06-28

All new behavior in this release is **opt-in or default-safe** — existing
installs keep their previous behavior until a flag is set or an agent is
explicitly invoked. Minor bump (additive, backward-compatible).

### Added
- **Two new agents — roster 11 → 13.**
  - **`prompt-engineer`** — system prompts, prompt/template authoring, guardrail
    rules, prompt evals, LLM-judge rubrics, and prompt-injection defense.
  - **`mcp-builder`** — design, build, and test MCP servers: tool-schema design,
    stdio/http transport, and MCP auth/secret launchers.
  - Routing wired everywhere: `CLAUDE.md` agents table + decision tree,
    `validators/validate-agent-output.sh` (`VALID_AGENTS` → 13-roster), and the
    session-start protocol.
- **Six new hooks (all opt-in or non-blocking).**
  - `hooks/auto-init-check.sh` (SessionStart) — soft, idempotent auto-init check
    that advises running `/init-scaffolding` when a project is unconfigured;
    never mutates the repo.
  - `hooks/post-edit-format.sh` (PostToolUse `Edit|Write`) — auto-formats only
    the single edited file via a runtime-detected formatter (ruff/black,
    prettier, `dotnet format`); always exits 0, never blocks. Opt-in via
    `SCAFFOLDING_AUTOFORMAT=1`.
  - `hooks/notify.sh` (Stop / Notification) — desktop/terminal notification when
    a turn finishes or input is needed; pure no-op without a notifier. Opt-in via
    `SCAFFOLDING_NOTIFY=1`.
  - `hooks/completion-nudge.sh` (Stop) — nudges toward finishing the delegation
    chain; loop-guarded via `stop_hook_active`. Opt-in via
    `SCAFFOLDING_COMPLETION_NUDGE=1` (advisory) or `=block` (strict).
  - `hooks/block-subagent.sh` (PreToolUse `Task`) — hard-denies the
    `general-purpose` and `explore` subagent types.
  - `hooks/file-size-warn.sh` (PostToolUse `Write`) — warn-only when a written
    file exceeds 500 lines; never blocks.
- **`/init-rules` command + `templates/nested-claude.md`** — scaffolds opt-in,
  path-scoped nested `CLAUDE.md` rule files so per-area conventions lazy-load
  only when Claude works under that directory, while routing stays always-loaded.
- **Per-phase model tiers (opt-in by infra).** `analyst`, `architect`, and
  `reviewer` frontmatter now declare `model: opus` + `effort: high`; `developer`
  and all other agents stay `model: inherit`. Pinning the reviewer to a higher
  tier than the implementer breaks same-model self-review — the reviewer now
  records a `cross_model` field in its report (true when judged on a higher tier,
  false when an infra fallback collapses both onto the same tier).
- **`docs/model-tiers.md`** — documents the model-tier + cross-model-review
  contract and the aiproxy/litellm mapping (the plugin emits only the literal
  names `sonnet`/`opus`/`haiku`; backend mapping and any cross-vendor review live
  on the aiproxy side).
- **`docs/orchestration-pattern.md`** — multi-agent orchestration pattern guide.
- **Experimental agent-teams mode + `docs/agent-teams.md`**, gated behind
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (off by default).
- **`context: fork`** on four heavy skills (`ui-ux-pro-max`, `mui-styling`,
  `logging-standards`, `monitoring-observability`) so they run in a forked
  context instead of inflating the main thread.
- **`` !`command` `` dynamic injection** in the `git-operations`,
  `worktree-management`, and `context-engineering` skills, injecting live command
  output at skill-load time.

### Changed
- **Critical rules emphasized with `<important>`** in `CLAUDE.md` (blocked
  subagent types, delegation mandate) for stronger adherence.
- **Softened forced delegation.** Trivial, conversational, or factual questions
  may now be answered directly; real engineering work (code, design, debugging,
  multi-step tasks) is still always delegated.
- **Key Rule 3 demoted to a pre-commit-hook pointer** — validate-before-commit is
  enforced deterministically by `hooks/pre-commit-validation.sh`, so the rule now
  points at the hook rather than restating the policy.

### Fixed
- **Corrected stale component counts in `README.md` and `docs/`** — commands
  18 → 19 (adds `/init-rules`), hooks 9 → 15, and refreshed the version badge from
  the stale 2.7.1 to 2.8.0.

## [2.7.3] - 2026-06-25

### Changed
- **Trimmed `CLAUDE.md` static context by ~44%** (146 → 71 lines, 5884 → 3306 chars). Removed four sections that duplicated content already shipped as on-demand skills: *Worktree Delegation Protocol* (→ `worktree-management`), *MCP Tools* (→ `mcp-tools`), *OpenSpec & Specs Path* (→ `spec-workflow`), and the redundant *Delegation Format* block. *Large Edit Prevention* folded into one Key Rules line. Routing fidelity preserved (all 11 agents + decision tree intact). Applies the static-vs-dynamic context boundary from Google's "New SDLC with Vibe Coding" whitepaper — static context is paid on every turn, so reference detail belongs in dynamic skills.

## [2.7.2] - 2026-06-24

### Fixed
- **Hook commands in `settings.json` now use `${CLAUDE_PLUGIN_ROOT}`.** The 7 Edit/Write and git hooks were registered with relative paths (`.claude/hooks/*.sh`), resolved against the process cwd; when a tool ran from a cwd lacking `./.claude/hooks` (worktree isolation, other projects), `sh` reported `not found` — non-blocking but noisy on every edit. Now matches `plugin.json` (fixed earlier in 38e70b4).

## [2.7.1] - 2026-06-15

### Fixed
- **SOFA consume flow (phase 1) corrected against the live API.** `sofa-search` + `/sofa` now create a SOFA session up front (the API returns HTTP 400 `missing_session`, not 401) and send the required `X-Sofa-Client-Name` / `X-Sofa-Client-Version` / `X-Sofa-Model-Name` / `X-Sofa-Model-Version` metadata headers, attaching `X-Sofa-Session` to every authenticated call; search now uses `search`/`per_page`/`tag` query params instead of the non-existent `limit`. Verified end-to-end (session → search → read → leaderboard) against agents.stackoverflow.com.

## [2.7.0] - 2026-06-14

### Added
- **SOFA integration — phase 1 (consume).** New `sofa-search` skill + `/sofa` command let agents search Stack Overflow for Agents (agents.stackoverflow.com) for peer-verified solutions before solving an unfamiliar problem from scratch. Read-only (search/read); per-user credentials resolved from `SOFA_API_KEY` / `./.sofa/` / `~/.sofa/`, with a clean no-op when unconfigured (no key is ever bundled). Contribute (ask/answer/verify) and skill-hosting are planned for later phases.

## [2.6.0] - 2026-06-14

### Added
- **`/doctor` command — onboarding health-check.** Diagnoses the common install gotchas that silently break a fresh setup — agent resolution / missing `/reload-plugins`, hook registration, `plugin.json`, `CLAUDE.md`, the `.scaffolding/` directory, and the optional MCP semantic memory backend — and reports the exact fix for each. Read-only: it never mutates the repo or config. Brings the command count to 17.

### Changed
- **Decoupled project-specific stack defaults from 10 skills** (`mui-styling`, `python-patterns`, `logging-standards`, `state-management`, `react-patterns`, `error-handling`, `pattern-recognition`, `quality-validation`, `testing-strategy`, `database-optimization`). Their `description` frontmatter is now stack-agnostic, so the skills auto-invoke correctly for any stack rather than only the team's. The team's specific stack (FastAPI / MUI / Zustand / structlog / etc.) is retained throughout, but only as clearly-labeled illustrative examples.

## [2.5.2] - 2026-06-14

### Changed
- **Deduplicated agent comms boilerplate.** The byte-identical SendMessage recipient-validation and `worktreePath`/CWE-59 safety blocks (~6,785 chars) duplicated across 6 agents were extracted into a new shared `agent-comms` skill; each agent keeps a compact inline rule plus a pointer. Skill library is now 34.

### Removed
- **Dead `.gitkeep` files** from 7 now-populated directories (agents, skills, hooks, validators, output-styles, templates, workflows).

## [2.5.1] - 2026-06-14

### Changed
- **Leaner SessionStart hook.** `session-start-protocol.sh` now injects a thin pointer to `CLAUDE.md` instead of re-emitting the full routing table (~3,800 chars), saving ~800–950 tokens per session-start/resume/compact.

### Fixed
- **Stale `claude-scaffolding:` namespace** in the SessionStart hook corrected to `scaffolding:`, matching the registered marketplace namespace and `CLAUDE.md`.
- **Duplicate SessionStart registration** removed from `settings.json` (it had broken `.claude/hooks/...` paths and double-injected the protocol); `plugin.json` is now the single source of truth for hook registration.

## [2.5.0] - 2026-06-14

### Added
- **`memory` skill** — unified memory CRUD: write/update/delete/query file-based markdown entries and sync to the MCP semantic store, with dedup-before-write. Brings the skill library to 33.

## [2.4.0] - 2026-06-06

### Added
- **Memory conventions in the `agent-memory` and `semantic-memory-store` skills.**
  Documented the hot/cold split (lean auto-injected file memory vs. on-demand vector
  recall), `confidence` / `last_verified` frontmatter with proactive decay, a
  search-before-store rule to avoid silent duplicate bloat on distilling backends
  (e.g. mem0), and a local-only carve-out keeping secrets and MCP-recovery info out of
  the shared vector store.
- **Optional Vault token auto-refresh for `/memory`.** `/memory enable` can now install a
  per-device SessionStart hook (`refresh-mcp-token.sh`) that re-pulls `MEMORY_MCP_TOKEN`
  from Vault each session and keeps user `settings.json` topped up. Opt-in only — never an
  always-on plugin hook — and a clean no-op without the `vault` CLI. `/memory disable`
  documents its removal.

## [2.3.0] - 2026-05-30

### Added
- **`/memory` command — cross-device semantic memory (opt-in).** A single
  command with `enable` / `disable` / `status` that wires an optional
  self-hosted [mem0](https://github.com/mem0ai/mem0) backend (PostgreSQL +
  pgvector, local LLM/embeddings via Ollama) into Claude Code at user scope.
  When enabled, the existing `semantic-memory-mcp` / `semantic-memory-store`
  skills become live: agents persist and recall insights across sessions and
  devices via `semantic_search` / `semantic_recall` / `semantic_store`. Memory
  is **off by default** and personal (token-gated); without a backend, skills
  degrade gracefully to file-based memory. Brings the command count to 16.
- **`memory-project-id.sh` hook (SessionStart).** Computes a stable
  `project_id` from the git remote and injects it as session context so agents
  scope semantic memory per repository (shared across your devices). Brings the
  hook count to 9.

### Changed
- **`semantic-memory-mcp` skill documents `project_id`.** The search/recall
  tool reference and examples now include the per-project `project_id` argument
  supplied by the SessionStart hook, matching the `semantic-memory-store` skill.

## [2.2.0] - 2026-05-20

### Added
- **`/create-skill` command + `skill-authoring` skill.** A new interactive
  command, backed by the `skill-authoring` skill, that walks users through
  authoring their own scaffolding-compatible skills — from `SKILL.md`
  frontmatter and trigger description through directory layout and validation.
  Brings the skill count to 32 and the command count to 15.
- **`/learn` command — closed-loop learning.** Distills reusable insights from
  a finished conversation and proposes new memory entries or skills, connecting
  the `agent-memory` and `distill` skills so the scaffolding improves itself
  over time.

### Changed
- **Hardened skill auto-trigger descriptions.** All 32 skill `description`
  fields were rewritten into an explicit `TRIGGER when: ... SKIP: ...` form so
  Claude Code reliably auto-invokes the right skill and avoids false positives.

### Removed
- **Deprecated `/generate-prp` and `/execute-prp` commands.** The PRP (Product
  Requirements Prompt) workflow has been superseded by the OpenSpec specs
  workflow (`commands/specs/`). The `prp-document` validator is removed
  alongside the commands.

## [2.1.0] - 2026-05-14

### Added
- **Parallel Fan-Out Protocol + peer-to-peer Comms Protocol** (#1). Coordinator
  can now spawn parallel-safe agents (analyst, researcher, architect, debugger,
  optimizer) in the background via Task tool with `run_in_background: true` and
  unique names, capped at MAX_PARALLEL=4. Adds peer-to-peer SendMessage handoff
  between named agents (researcher -> architect -> developer -> reviewer ->
  gitops), replacing return-to-orchestrator routing for the hot path.
- Anti-drift guardrails: developer/reviewer/gitops never background-spawned;
  developer -> reviewer -> gitops always sequential; developer never calls git
  commit (gitops only); reviewer PASS dual-sends to gitops + orchestrator;
  reviewer CRITICAL escalates to orchestrator + STOP; unknown SendMessage
  recipient falls back to orchestrator return.
- `runId` prefix on parallel fan-out names (`<runId>-<base-name>`) to prevent
  SendMessage routing collisions across concurrent coordinator runs.

### Fixed
- **Hardened Comms Protocol** (#2):
  - worktreePath validation in reviewer + gitops: absolute path under repo root,
    no `..` segments, not a symlink (realpath -e canonical check), exact-match
    against `git worktree list --porcelain` (mitigates CWE-22 + CWE-59).
  - SendMessage fallback now covers timeout (>120s), unknown recipient, AND
    peer_dead (detected via Task exit). Coordinator returns to orchestrator with
    structured error metadata, never blocks silently.
  - architect peer-existence check before any upstream SendMessage; escalate to
    orchestrator with `missing_upstream_peer` error instead of waiting.
  - Numbered peer names: two-stage matching (exact whitelist first, then one
    strip pass for trailing `-<digit>+` or `-<word>`) across all 6 affected
    files. Fixes tech-writer regression and handles fan-out names like
    `researcher-1`, `analyst-backend`, `architect-synth`.
  - Recipient validation regex + 11-agent whitelist before any SendMessage,
    fallback to orchestrator on validation failure.
  - `orchestrator` declared as reserved address (always reachable, not
    spawnable) across all 5 agent files.
  - developer no longer bypasses reviewer to gitops directly; escalates to
    orchestrator when reviewer is absent.
  - reviewer low/medium severity triple-sends (developer + orchestrator + gitops
    HOLD) so gitops does not merge while developer iterates.
  - MAX_PARALLEL=4 enforcement made explicit; coordinator-in-coordinator
    recursion banned.
  - Gitops gets full Comms Protocol section (was missing) including recipient
    validation, worktreePath validation, and last-write-wins semantics for
    concurrent HOLD/APPROVE signals per worktreeBranch.
- "security-sensitive" scope narrowed to auth/authz, crypto, PII, external
  network egress, secrets management. General refactors with no privilege
  boundary change do not escalate.
- `scope_creep` STOP condition unified across developer + reviewer with
  identical wording and same escalation contract.

## [2.0.0] - 2026-04-28

### BREAKING
- **Removed `install.sh` flow entirely.** Plugin marketplace is now the single
  install path. Users on `install.sh --target ~/.claude` must migrate (see below).
- **Removed `__CLAUDE_SCAFFOLDING_*__` template parametrization.** Project name,
  test commands, Sonar key, schemas dir, and backend example path are no longer
  parametrized at install time. Defaults (`pytest`, `npm test`, `(project)`,
  `./.scaffolding/openspec/schemas`, `app/backend/app/feature/`) are baked in;
  override per-project by editing `CLAUDE.md` after `/init-scaffolding`.

### Removed
- `install.sh`, `uninstall.sh`, `.scaffolding.env.example`
- `templates/*.tmpl` files (`CLAUDE.md.tmpl`, `settings.json.tmpl`,
  `agents/*.tmpl`, `commands/*.tmpl`, `skills/*/SKILL.md.tmpl`)
- `hooks/post-install.sh` — was never wired into any plugin lifecycle hook;
  its logic is fully covered by `commands/init-scaffolding.md`
- `docs/parametrization.md`, `docs/installation.md` — described the removed flow
- CI: `install-idempotency` job, `placeholder-sanity` job, `install.sh`/`uninstall.sh`
  shellcheck and bash-syntax steps, install.sh release assets

### Changed
- `commands/init-scaffolding.md`: removed the trailing reference to `install.sh`
  for "full parametrization" — that flow no longer exists
- `docs/adopting-in-legacy-repo.md`: rewritten in English for plugin flow
- `README.md`: collapsed the two-flow install matrix into a single linear
  install procedure; removed Option B section, parametrization section,
  and `install.sh --refresh` references

### Migration

Users who previously ran `install.sh --target ~/.claude`:

```bash
# Cleanup install.sh-rendered files:
rm -rf ~/.claude/{agents,skills,commands,hooks,templates,validators,output-styles,workflows}
rm -f  ~/.claude/CLAUDE.md ~/.claude/settings.json ~/.claude-scaffolding.env

# Then in Claude Code:
#   /plugin marketplace add komluk/scaffolding
#   /plugin install scaffolding@komluk-scaffolding
#   /reload-plugins
#   /init-scaffolding   (run from each project root)
```

`~/.claude/settings.local.json` is not touched by either flow and stays as-is.

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
