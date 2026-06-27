# Design: Top-6 Scaffolding Plugin Enhancements

**Status:** Analysis only — no implementation in this document.
**Builds on:** PR #4 (`feat/plugin-enhancements`) — soft auto-init, auto-format+notify hooks,
nested-CLAUDE scaffolder (`/init-rules`), orchestration docs, agent-teams flag. This work
**assumes PR #4 has landed.**
**Overriding constraint:** *do it wisely, do not break or worsen anything.* Every item must be
reversible, default-safe, and must not weaken always-loaded routing or hook exit-code semantics.

---

## Context

The scaffolding plugin is a Claude Code plugin: 11 agents (`agents/*.md`), ~35 skills
(`skills/*/SKILL.md`), 18 commands (`commands/*.md`), 9 registered hooks (`hooks/*.sh` wired in
both `settings.json` and `.claude-plugin/plugin.json`). It routes all work through a delegation
protocol declared in the project-root `CLAUDE.md`, and all model traffic flows through
`ANTHROPIC_BASE_URL=aiproxy` (litellm), giving us a model-routing seam we do not control from the
plugin but can *hint* into.

Relevant current state confirmed by reading the repo:

- `CLAUDE.md` (plugin copy) is **71 lines** — already within budget. The size problem is in the
  user's **live** `~/.claude/CLAUDE.md` and `/home/komluk/repos/CLAUDE.md`, which duplicate the
  full Protocol + Agents table + Decision Tree + Key Rules verbatim, and in heavy project repos.
- `settings.json` enforces validate-before-commit **deterministically already** via
  `hooks/pre-commit-validation.sh` (PreToolUse `Bash(git commit:*)`, `exit 1` on failure).
- "Blocked subagents" and "file-size limits" are **prose-only** in `CLAUDE.md` — not harness-enforced.
- The `Stop` hook currently runs **only** `hooks/notify.sh` (opt-in, `SCAFFOLDING_NOTIFY=1`).
- All 11 agents are `model: inherit`. `ultrathink` exists only as **prose** "Extended Thinking
  Triggers" sections in `agents/analyst.md` and `agents/architect.md` — not frontmatter.
- No skill uses `context: fork`. No skill uses `` !`command` `` dynamic injection.
- `reviewer` is `model: inherit` → **self-review by the same model** as the implementer.
- `context-engineering` SKILL.md already codifies the always-loaded vs nested-CLAUDE tier split
  and the **hard rule** that routing never moves to a nested file; `/init-rules` (PR #4) is the
  opt-in scaffolder for nested code-convention CLAUDE.md.
- `commands/doctor.md` **already ships guards** for this work: check 5b asserts the routing
  section is intact in root `CLAUDE.md` (Item-1 guard), check 5c asserts every agent `skills:`
  reference resolves and every skill has a `description:` (Item-4 guard). Doctor comments already
  name "Item 1" and "Item 4" — PR #4 pre-wired the safety net.

---

## Goals / Non-Goals

**Goals**
- Make critical rules harder to skip (emphasis + harness enforcement where deterministic).
- Break self-review blind spots by routing reviewer/plan-check to a *different* model via litellm.
- Nudge completion verification before the agent yields, without loops or cost blowups.
- Save main-thread context by forking heavy one-shot skills.
- Express per-phase model tier + effort declaratively.
- Inject cheap live shell context into select skills.

**Non-Goals**
- Do NOT hardcode aiproxy/litellm infrastructure (model names, fallback chains) into the plugin.
  The plugin emits **model hints + docs** only.
- Do NOT migrate the user's live `CLAUDE.md` files automatically. Item-1 stays opt-in + reversible.
- Do NOT change hook exit-code semantics of existing blocking hooks.
- No new runtime engine; everything expresses via existing Claude Code frontmatter / hooks / settings.

---

## Top-1 — Tighten CLAUDE.md reliability

### Mechanism

Three independent sub-levers, shippable separately:

**(a) Emphasis on critical rules.** Wrap the highest-stakes always-loaded lines in an emphasis
block. Claude Code honors `<important>` / strong-emphasis framing. Concretely, in the **plugin**
`CLAUDE.md` (and the `/init-scaffolding` + `/init-rules` templates that generate the user copy),
wrap the routing mandate and the BLOCKED-SUBAGENT list:

```markdown
<important>
NEVER answer a coding task directly. ALWAYS delegate via
Task(subagent_type="scaffolding:<agent>"). NEVER use `general-purpose` or `explore`
for planning/analysis.
</important>
```

This is **additive formatting only** — no rule changes, no relocation. Lowest risk of the three.

**(b) Move harness-enforceable rules from prose to deterministic enforcement.**

| Current prose rule (`CLAUDE.md` Key Rules) | Already deterministic? | Action |
|---|---|---|
| 3. Validate before commit | **Yes** — `pre-commit-validation.sh` exits 1 | Keep hook as source of truth; downgrade the prose line to a one-line pointer ("enforced by pre-commit hook"). No behavior change. |
| BLOCKED subagents (`general-purpose`, `explore`) | No — prose only | Add a **PreToolUse `Task` hook** (`hooks/block-subagent.sh`) that reads `tool_input.subagent_type` from stdin and `exit 2` (deny) when it matches a denylist. |
| 1. Files < 500 lines / Edit < 200 lines | No — prose only | Add a **PostToolUse `Write` warn-only hook** (`hooks/file-size-warn.sh`) that emits a stderr advisory when a written file exceeds 500 lines. **Warn, never block** — generated files and legitimate large files must not be blocked. |

CLAUDE.md keeps the *judgment* rules (decision tree, ownership boundaries); the *mechanical*
rules become hooks where a deterministic check exists.

**(c) Trim toward <200 lines / <2000 tokens.** The plugin `CLAUDE.md` is already 71 lines — no
action needed there. The real target is the **generated user CLAUDE.md** in heavy repos. The
duplicated **Agents table** (11 rows) and **Decision Tree** are the bulk. Per the
`context-engineering` tier rule, only **path-specific code conventions** may relocate to a nested
CLAUDE.md via `/init-rules` — the Agents table and Decision Tree are routing and **must stay
always-loaded**. So the trim available is limited to: (i) collapsing the Agents table into the
Decision Tree (the table duplicates routing already implied by the tree), and (ii) moving the
"Detailed protocols" pointer list into a skill reference. Net realistic saving: modest.

### Exact files to change

- `CLAUDE.md` (plugin) — add `<important>` wrappers; demote Key-Rule-3 to a hook pointer.
- `commands/init-scaffolding.md`, `commands/init-rules.md` — same edits in the generated template
  so new installs inherit the tightened form.
- `settings.json` + `.claude-plugin/plugin.json` — register `block-subagent.sh` (PreToolUse,
  matcher `Task`) and `file-size-warn.sh` (PostToolUse, matcher `Write`). **Both hook arrays must
  stay byte-identical between the two files** (existing invariant).
- `hooks/block-subagent.sh`, `hooks/file-size-warn.sh` — new.
- `commands/doctor.md` — check 5b already guards routing intact; extend its line count to also
  assert the `<important>` block + the two new hooks are registered (optional, low priority).

### Regression risks + mitigations

| Risk | Mitigation |
|---|---|
| Relocating routing weakens first-message delegation | **Hard invariant: routing never moves.** Doctor check 5b already fails if `subagent_type="scaffolding:` is absent from root CLAUDE.md. Only code-conventions relocate, only via opt-in `/init-rules`. |
| `block-subagent.sh` false-positive blocks a legit Task | Denylist is a fixed 2-entry set (`general-purpose`, `explore`); exact-match only; `exit 2` with a clear stderr reason. Easy to disable by removing the hook. |
| `file-size-warn.sh` becomes noisy / blocks | Warn-only (`exit 0`), stderr advisory; never blocks. |
| Editing the user's **live** CLAUDE.md breaks their muscle memory / other plugins | **Do not touch live files.** Ship template changes only; provide an opt-in `/init-rules --migrate` that prints a diff and applies only on confirmation. Keep a `.bak`. |
| `<important>` syntax not honored → silent no-op | Pure formatting; worst case is "no change", never a regression. |

### Rollout

- (a) emphasis: **default-on** in templates (additive, safe).
- (b) `block-subagent.sh`: **default-on** (enforces an existing documented rule deterministically).
- (b) `file-size-warn.sh`: **default-on but warn-only.**
- (c) live-file migration: **opt-in, reversible** (`/init-rules`, prints diff, `.bak`, confirm).

### Needs its own deeper analysis before coding? **YES.**
This touches the user's live CLAUDE.md files and the routing contract. Sub-lever (c) and the live
migration deserve a dedicated proposal.md/design.md with explicit before/after token counts and a
rollback script. (a) and (b) can ride in a smaller PR.

---

## Top-2 — Cross-model review / plan-check via aiproxy/litellm

### Mechanism

Today `reviewer` and the Plan≥85 gate are `model: inherit` → same model that produced the work
also judges it. Break this by routing the **judge** to a different model through litellm.

The plugin must NOT hardcode infra. Two layers:

1. **Plugin layer (this work):** give `reviewer` (and optionally a plan-check pass) a *model hint*
   that resolves to an alias, not a concrete model:
   - Option A — per-agent frontmatter: `model: ${SCAFFOLDING_REVIEW_MODEL:-inherit}`. If Claude
     Code does not expand env in `model:`, fall back to Option B.
   - Option B — a documented env knob `SCAFFOLDING_REVIEW_MODEL` read by the orchestrator/command
     that spawns the reviewer, passed as the `model` arg on the `Task` call. The command/coordinator
     already constructs the Task invocation, so it can inject the alias.
   - The alias (e.g. `scaffolding-reviewer`) is a **litellm model_list entry**, not a vendor model.
2. **aiproxy layer (separate, infra-owned):** litellm `model_list` must define the
   `scaffolding-reviewer` alias pointing at a *different* model than the default
   (e.g. default = Sonnet for dev, reviewer alias = Opus or a non-Anthropic model), plus a
   `fallbacks:` entry so that if the alt model is unavailable, litellm degrades to the default.

### Graceful degradation
- If `SCAFFOLDING_REVIEW_MODEL` is unset → `model: inherit` → today's behavior (no regression).
- If the alias is set but litellm has no such entry / it 404s → litellm `fallbacks` catches it and
  serves the default model; the review still runs (self-review), just logs a downgrade note.
- The reviewer agent body gains one line: "If you were routed to the default model (no cross-model
  alias available), note `cross_model: false` in the report frontmatter so the audit trail records
  that this was a self-review."

### Exact files to change
- `agents/reviewer.md` — change `model: inherit` → env-driven hint (Option A) **or** leave
  frontmatter and document the Task-arg injection (Option B); add the `cross_model:` report field.
- `commands/specs/verify.md` (and any command that spawns reviewer) — inject `model` arg if env set.
- Plan-check: `skills/quality-validation/SKILL.md` / `skills/planning-methodology/SKILL.md` —
  document that the ≥85 gate *may* be run by a second model; the architect/analyst that scores the
  plan reads the same `SCAFFOLDING_PLANCHECK_MODEL` knob.
- `docs/` — new short doc `docs/cross-model-review.md` describing the env knobs **and the litellm
  `model_list` + `fallbacks` entries the user must add on the aiproxy side** (config snippet, not
  applied by the plugin).
- `commands/doctor.md` — optional OPTIONAL-tier check: if `SCAFFOLDING_REVIEW_MODEL` is set, note it.

### What changes on aiproxy vs in the plugin
- **Plugin:** model *alias* hints + docs + report field. Nothing infra-specific.
- **aiproxy (user/infra, separate change):** add `scaffolding-reviewer` / `scaffolding-plancheck`
  aliases to litellm `model_list`, each with a `fallbacks` entry to the default. This is a config
  PR in the aiproxy repo, **out of scope for the plugin PR** — the plugin doc just specifies the
  contract.

### Regression risks + mitigations
| Risk | Mitigation |
|---|---|
| Alt model unavailable stalls reviews | litellm `fallbacks` → default model; never hard-fail. |
| Env knob unset silently keeps self-review | That is the safe default; `cross_model: false` makes it visible in the report. |
| `model:` env-expansion not supported by Claude Code | Fall back to Option B (Task-arg injection by the command). Validate which works before coding. |
| Cost increase (Opus reviewer) | Opt-in via env; document cost trade-off. |

### Rollout: **opt-in** (env knob unset = today's behavior).
### Needs its own deeper analysis? **YES.** Verify whether `model:` frontmatter expands env, or
whether Task-arg injection is required; confirm the litellm alias/fallback contract with the
aiproxy owner. Dedicated PR. **Unify the model-selection mechanism with Top-5 (see below).**

---

## Top-3 — Stop hook completion-nudge

### Mechanism
Add a `Stop` (and optionally `SubagentStop`) hook `hooks/completion-nudge.sh` that, before the
agent yields, emits a short checklist reminder to verify completion (tests run? task done?
validation passed?).

**Loop prevention is the core design problem.** A Stop hook that returns exit 2 / `decision: block`
re-prompts the model and can loop forever. Design:

- The hook reads the `stop_hook_active` field from the Stop event stdin JSON. **If
  `stop_hook_active` is true, the hook immediately `exit 0`** — this is the Claude Code-provided
  guard that the stop was already triggered by a prior hook pass. This single check makes infinite
  loops impossible.
- The nudge is **advisory**: it writes the checklist to **stderr and `exit 0`** (does not block).
  This is the safe default — it never forces another turn, just surfaces a reminder in the
  transcript. (A stricter `exit 2`-once variant is possible but gated behind an env flag.)
- Cheap: pure bash + a `stop_hook_active` JSON read via python3 (same pattern as existing hooks).
  No network, no agent spawn.

### Exit-code / behavior
- Default mode (`SCAFFOLDING_COMPLETION_NUDGE=1`, advisory): print checklist to stderr, `exit 0`.
- Strict mode (`SCAFFOLDING_COMPLETION_NUDGE=block`, opt-in power-user): `exit 2` **exactly once**,
  guarded by `stop_hook_active` so it can never fire twice in a row.
- Disabled (unset): `exit 0` fast-path no-op (same gating style as `notify.sh`).

### Interaction with `pre-commit-validation.sh`
- `pre-commit-validation.sh` runs at **PreToolUse(git commit)** — a different lifecycle point.
  The completion-nudge runs at **Stop** (end of turn). They do not overlap or double-run.
- The nudge's checklist should **point to** the validation hook ("did you let the pre-commit hook
  run?") rather than re-run validation — avoid duplicating the expensive test run. The nudge stays
  cheap; the commit hook stays the real gate.

### Exact files to change
- `hooks/completion-nudge.sh` — new.
- `settings.json` + `.claude-plugin/plugin.json` — add to the `Stop` array (alongside `notify.sh`),
  identical in both files. Optionally `SubagentStop`.
- `hooks/README.md` — document gating + loop-prevention.
- `commands/doctor.md` — optional: list the hook in the executable-hooks count.

### Regression risks + mitigations
| Risk | Mitigation |
|---|---|
| Infinite loop | `stop_hook_active` early-exit guard; advisory default never blocks. |
| Noisy on every trivial turn | Default-on but **advisory-only** (stderr); strict/block mode is opt-in. |
| Slows turn end | Pure-bash, no I/O; sub-millisecond. |
| Collides with `notify.sh` ordering | Independent hooks; nudge does not depend on notify. Order irrelevant (both exit 0). |

### Rollout: **opt-in default-safe.** Advisory mode behind `SCAFFOLDING_COMPLETION_NUDGE=1`
(recommend shipping advisory as default-on only after a release of soak; ship gated first).
### Needs its own deeper analysis? **NO** — self-contained, but must be implemented carefully
against the Claude Code Stop-hook JSON contract (`stop_hook_active`).

---

## Top-4 — `context: fork` on heavy / one-shot skills

### Mechanism
`context: fork` frontmatter runs the skill in an isolated forked subagent so its large body and
working notes do not pollute the main thread's context. Add the field to skills that are **heavy
AND one-shot** (read once, produce an artifact, don't need to interleave with main reasoning).

### Candidate skills (by size + one-shot nature)
| Skill | Lines | Fork? | Reason |
|---|---|---|---|
| `ui-ux-pro-max` | 420 | **YES** | Largest skill; a self-contained design pass, one-shot. |
| `mui-styling` | 316 | **YES** | Large reference catalog; applied in a focused styling pass. |
| `logging-standards` | 314 | **YES** | Reference-heavy, consulted once when wiring logging. |
| `monitoring-observability` | 282 | **YES** | Reference-heavy, one-shot setup. |
| `database-optimization` | 214 | maybe | Heavy but optimizer may interleave with main reasoning — test first. |
| `testing-strategy` | 275 | **NO** | Used iteratively *throughout* dev; forking loses live test context. |
| `pattern-recognition` | 223 | **NO** | Must see the *current* code in main context to match patterns. |

### Exact frontmatter change
Add one line to the candidate `SKILL.md` frontmatter:
```yaml
---
name: ui-ux-pro-max
description: "..."
context: fork
---
```
No body change.

### Risks (does fork lose needed context?)
| Risk | Mitigation |
|---|---|
| Forked skill can't see main-thread code/decisions | Only fork skills that operate on an explicit handoff (a file path, a component) rather than ambient context. Pattern-recognition / testing-strategy must **NOT** fork. |
| `skill-authoring` frontmatter contract currently allows only `name`+`description` | **Blocker:** `skills/skill-authoring/SKILL.md` says "No other frontmatter fields are used" and `validators/validate-skill.sh` may reject extra fields. Must (1) confirm Claude Code supports `context: fork`, and (2) update `skill-authoring` + the validator to allow it. |
| Fork overhead for a skill that turns out interactive | Start with the 4 clearly one-shot skills; measure; expand conservatively. |

### Exact files to change
- `skills/ui-ux-pro-max/SKILL.md`, `skills/mui-styling/SKILL.md`,
  `skills/logging-standards/SKILL.md`, `skills/monitoring-observability/SKILL.md` — add `context: fork`.
- `skills/skill-authoring/SKILL.md` — document `context: fork` as an allowed optional field + when to use.
- `validators/validate-skill.sh` — allow the new optional field (if it currently whitelists fields).
- `docs/orchestration-pattern.md` — note fork as a third delivery mode beside preloaded/invoked.

### Rollout: **opt-in per skill** (only the 4 named skills initially). Easily reverted (delete one line).
### Needs its own deeper analysis? **Light.** Must first confirm Claude Code honors `context: fork`
for skills and update the validator/contract. If unsupported, this item is a no-op — verify before coding.

---

## Top-5 — Per-phase model tier + ultrathink

### Mechanism
Let each agent/phase declare a model tier and a reasoning-effort level, leveraging the aiproxy
routing seam. Two expressions:

1. **Model tier via agent `model:` frontmatter** — replace `model: inherit` on high-stakes agents
   with an alias hint:
   - `architect`, `analyst` (plan/design) → `model: ${SCAFFOLDING_PLAN_MODEL:-inherit}` (intended:
     Opus-tier alias).
   - `developer` (code) → stays `inherit` (intended: Sonnet-tier default).
   - `reviewer` → the Top-2 cross-model alias.
   These resolve to **litellm aliases**, not vendor model names (same no-hardcode rule as Top-2).
2. **Effort / ultrathink** — today `ultrathink` lives as **prose** "Extended Thinking Triggers" in
   `agents/analyst.md` and `agents/architect.md`. Promote it to an explicit, declarative trigger:
   keep the prose (it cues the model to emit "ultrathink") and, where Claude Code supports an
   `effort:`/thinking frontmatter field, add it to `architect`/`analyst` for high-stakes steps.
   If no frontmatter field exists, the lever stays the documented prose keyword — still effective.

### Unification with Top-2
Both Top-2 and Top-5 select models via litellm aliases. **Unify into a single mechanism:** one
documented set of env-driven aliases consumed identically wherever the plugin spawns an agent:

| Knob | Default | Intended tier | Consumers |
|---|---|---|---|
| `SCAFFOLDING_PLAN_MODEL` | `inherit` | Opus | analyst, architect |
| `SCAFFOLDING_REVIEW_MODEL` | `inherit` | Opus / cross-model | reviewer, plan-check (Top-2) |
| (code) | `inherit` | Sonnet | developer (unchanged) |

One `docs/model-tiers.md` documents all aliases + the litellm `model_list`/`fallbacks` contract
(shared with Top-2). The plugin never names a vendor model.

### Exact files to change
- `agents/architect.md`, `agents/analyst.md` — `model:` hint + optional `effort:`; keep ultrathink prose.
- `agents/reviewer.md` — shared with Top-2.
- `docs/model-tiers.md` — new, merges Top-2's `cross-model-review.md` content.
- `commands/coordinator`/spec commands that build Task calls — pass the alias if env set (Option B path).

### Regression risks + mitigations
| Risk | Mitigation |
|---|---|
| Alias unset / unsupported `model:` expansion | Default `inherit` = today's behavior; litellm fallback on missing alias. |
| `effort:` frontmatter unsupported by Claude Code | Keep ultrathink as prose keyword — no regression. |
| Cost increase (Opus for plan) | Opt-in env; document cost. |
| Divergence from Top-2 | **Unify** — single alias scheme, single doc. Ship Top-2 and Top-5 in the same PR. |

### Rollout: **opt-in** (all knobs default `inherit`).
### Needs its own deeper analysis? **YES**, jointly with Top-2 (same model-selection PR). Confirm
Claude Code `model:`/`effort:` frontmatter capabilities first.

---

## Top-6 — `!command` dynamic injection in skills

### Mechanism
Claude Code expands `` !`command` `` in a markdown body by running the command at load time and
inlining stdout. Use it to inject **cheap, safe, read-only** live context into select skills.

### Candidate skills + syntax
| Skill | Injection | Why |
|---|---|---|
| `git-operations` | `` Current branch: !`git branch --show-current` `` | Grounds git advice in the live branch. |
| `worktree-management` | `` Worktrees: !`git worktree list` `` | Shows live worktree state. |
| `context-engineering` | `` Tracked files: !`git ls-files \| wc -l` `` | Live repo size signal. |

Syntax (inline in the SKILL.md body, not frontmatter):
```markdown
Current branch: !`git branch --show-current`
```

### Risks (runs every load)
| Risk | Mitigation |
|---|---|
| Command runs on **every** skill load → cost/latency | Only cheap, instant commands (`git branch`, `git worktree list`). No network, no test runs, no `find /`. |
| Secret leakage into context | **Never** inject env dumps, tokens, `printenv`, `cat .env`. Read-only git/status only. |
| Command fails in a non-git dir | Use forms that fail quietly (`git ... 2>/dev/null || true`) so a non-repo load doesn't error. |
| Skill becomes non-portable | Keep injections to universally available commands (git). No project-specific binaries. |
| Conflicts with `skill-authoring` contract | Document `!command` as an allowed body construct in `skill-authoring`; add a "cheap + no-secrets" rule. |

### Exact files to change
- `skills/git-operations/SKILL.md`, `skills/worktree-management/SKILL.md`,
  `skills/context-engineering/SKILL.md` — add the inline injections.
- `skills/skill-authoring/SKILL.md` — add a short "Dynamic injection (`!command`)" subsection with
  the cheap/safe/no-secrets rule.

### Rollout: **opt-in per skill** (3 named skills). Trivially reverted.
### Needs its own deeper analysis? **NO** — small, but verify Claude Code executes `!command` in
*skill* bodies (it does in command/CLAUDE.md contexts; confirm for SKILL.md before relying on it).

---

## Recommended batching + order

| PR | Items | Rationale |
|----|-------|-----------|
| **PR-A (small, low-risk, ship first)** | Top-3 (completion-nudge), Top-6 (`!command`), Top-4 (`context: fork`) | All self-contained, additive, per-file opt-in, no contract/infra change beyond validator/skill-authoring doc updates. Fast feedback. |
| **PR-B (own deep analysis)** | Top-2 + Top-5 **unified** (cross-model review + per-phase tier + ultrathink) | Both select models via litellm aliases. One mechanism, one doc, one aiproxy-side contract. Needs a dedicated design + capability verification (`model:`/`effort:` frontmatter, litellm fallbacks). |
| **PR-C (own deep analysis, touches live files)** | Top-1 (CLAUDE.md reliability) | Touches the routing contract and the user's live CLAUDE.md. Split internally: (a)+(b) emphasis+hooks can be a sub-PR; (c)+migration needs proposal.md with token deltas and a rollback script. |

**Order:** PR-A → PR-B → PR-C. Do NOT combine. Each PR independently revertible.

**Pre-coding verification gates (must answer before each respective PR):**
1. Does Claude Code honor `context: fork` in SKILL.md? (Top-4)
2. Does `model:` frontmatter expand env vars? Is there an `effort:` field? (Top-2/5)
3. Does `` !`command` `` execute in SKILL.md bodies? (Top-6)
4. Exact Stop-hook stdin schema field name for loop guard (`stop_hook_active`). (Top-3)

---

## Per-item rollout flag table

| Item | Mechanism | Default | Flag / knob | Reversible by |
|------|-----------|---------|-------------|---------------|
| Top-1a emphasis | template formatting | **on** | n/a (additive) | revert template |
| Top-1b block-subagent | PreToolUse Task hook | **on** | remove hook | unregister hook |
| Top-1b file-size warn | PostToolUse Write hook | **on (warn-only)** | remove hook | unregister hook |
| Top-1c live migration | `/init-rules --migrate` | **opt-in** | explicit command + confirm | `.bak` restore |
| Top-2 cross-model review | litellm alias hint | **opt-in** | `SCAFFOLDING_REVIEW_MODEL` | unset env |
| Top-3 completion-nudge | Stop hook | **opt-in (advisory)** | `SCAFFOLDING_COMPLETION_NUDGE` | unset env / unregister |
| Top-4 context: fork | skill frontmatter | **opt-in per skill** | per-skill line | delete line |
| Top-5 model tier / effort | agent frontmatter + env | **opt-in** | `SCAFFOLDING_PLAN_MODEL` | unset env |
| Top-6 !command injection | skill body | **opt-in per skill** | per-skill edit | delete line |

---

## DO NOT TOUCH — invariant list

1. **Routing is always-loaded.** Protocol + Decision Tree + Agents table stay in the project-root
   `CLAUDE.md`. They NEVER move to a nested CLAUDE.md (loads too late to route). Doctor check 5b
   enforces this — do not remove it.
2. **gitops-only-commit.** Only `gitops` commits/merges/pushes; only `developer` writes source;
   only `tech-writer` writes README/CHANGELOG. No item may grant another agent these rights.
3. **Hook exit-code semantics.** Existing blocking hooks (`pre-commit-validation.sh` exit 1,
   `block-force-push.sh`, `block-env-write.sh`, `block-destructive-rm.sh`) keep their semantics.
   New hooks default to `exit 0` (advisory) unless the change is a documented deterministic gate.
4. **Staleness-update runs LAST.** `file-staleness-update.sh` must remain the last PostToolUse
   `Edit|Write` hook (after `post-edit-format.sh`), or stale-mtime false-blocks return. Any new
   PostToolUse hook inserts **before** it.
5. **Opt-in memory & flags.** Semantic memory, notify, autoformat, and every new knob stay opt-in /
   default-safe. No new default-on behavior that spawns agents, calls the network, or mutates files.
6. **`settings.json` ≡ `.claude-plugin/plugin.json`.** Hook arrays must stay byte-identical between
   the two files. Every hook registration change edits both.
7. **No hardcoded infra.** The plugin emits litellm *aliases* + docs; it never names a vendor model
   or writes aiproxy config.

---

## Explicit interaction analysis

### Top-1 ↔ nested-CLAUDE (PR #4)
PR #4's `/init-rules` is the **only** sanctioned path to relocate content out of the root
CLAUDE.md, and the `context-engineering` skill already fixes the boundary: **only path-specific
code conventions** may move; routing may not. Top-1c therefore *reuses* `/init-rules` rather than
inventing a new migrator, and adds a `--migrate` mode that diffs + backs up. The Item-1 risk
(weakening routing) is already fenced by doctor check 5b, which PR #4 shipped. Net: Top-1 composes
cleanly with PR #4 and must not introduce a second relocation path.

### Top-2 ↔ Top-5 (model selection)
Both reach into the same litellm alias seam. Shipping them separately would create **two
overlapping env schemes** for model selection. **Unify into one** (`SCAFFOLDING_PLAN_MODEL`,
`SCAFFOLDING_REVIEW_MODEL`, code=default), one `docs/model-tiers.md`, one aiproxy-side
`model_list`/`fallbacks` contract. Ship as a single PR-B. The reviewer alias (Top-2) is just the
review-tier entry in the Top-5 table.

### Top-3 ↔ pre-commit-validation
Different lifecycle points (Stop vs PreToolUse git-commit) → no double-run. The nudge must
**reference** the pre-commit hook, not re-run validation, to stay cheap and avoid duplicating the
test execution that `pre-commit-validation.sh` already owns. The commit hook remains the real gate;
the nudge is a reminder that surfaces *before* the user even reaches commit.

---

## Open Questions

1. Capability confirmations (the 4 pre-coding gates above) — must be answered against the running
   Claude Code version before each PR.
2. For Top-2/5, does the orchestrator/command layer reliably know which model alias to pass at
   Task-spawn time, or must it live in agent frontmatter? Determines Option A vs B.
3. Should Top-3's advisory nudge eventually become default-on after a soak release, or stay
   permanently opt-in?
4. For Top-1c, what is the measured token saving on a representative heavy project repo? If
   negligible, drop (c) and keep only (a)+(b).
