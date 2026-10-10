# Model Tiers & Cross-Model Review

Unifies the **per-phase model tier** (design Top-5) and **cross-model review**
(design Top-2) levers. The plugin pins **explicit served model slugs** in each
agent's frontmatter, so the model an agent runs on never depends on how an alias
(`sonnet`/`opus`/`haiku`/`inherit`) happens to resolve on the proxy side.

> **Capability notes (current Claude Code).**
> - `model:` frontmatter accepts full model IDs (e.g. `claude-opus-5-5`) as well
>   as the aliases `inherit`, `sonnet`, `opus`, `haiku`. (The earlier claim that
>   only the four literals were accepted was true of v2.1.195 and is **stale**.)
> - `model:` does **not** expand environment variables (the old
>   `${SCAFFOLDING_PLAN_MODEL}` env-alias plan remains out).
> - The Task tool `model` argument still accepts only `haiku` / `sonnet` / `opus`.
> - `effort:` frontmatter **is** supported: `low | medium | high | xhigh | max`
>   (`xhigh` and `max` are Opus-only).

---

## Explicit-pin policy

Every agent pins a full served slug. **Why:** an alias can resolve to a slug the
proxy does not serve (the *haiku incident*: `haiku`/`inherit` resolved to an
unserved model and the agent failed). Pinning the exact slug removes that
failure mode and makes tier intent reviewable in the diff.

| Agent | `model:` | `effort:` | Tier intent | Rationale |
|-------|----------|-----------|-------------|-----------|
| `analyst` | `claude-opus-5-5` | `high` | Highest-stakes reasoning | Requirements/scope/feasibility — errors here propagate downstream. |
| `architect` | `claude-opus-5-5` | `high` | Highest-stakes reasoning | Plan/design is the highest-leverage step ("Opus for plan"). |
| `reviewer` | `claude-opus-5-5` | `high` | Cross-model judge | Strictly above the developer tier — breaks same-model self-review. |
| `debugger` | `claude-opus-5-5` | `high` | Root-cause reasoning | Non-obvious failures need the strongest reasoning tier. |
| `developer` | `claude-sonnet-5-5` | per file | Implementer tier | Writes the code the reviewer judges. |
| `researcher`, `devops`, `optimizer`, `coordinator`, `mcp-builder`, `prompt-engineer` | `claude-sonnet-5-5` | per file | Worker tier | Capable default for implementation-style work. |
| `gitops`, `tech-writer` | `claude-haiku-5-5` | `low` | Mechanical tier | Git ops and docs are low-reasoning; minimize latency/cost. |

Sonnet-tier agents keep whatever `effort:` they already declared; only `model:`
was changed for them.

### `effort:` levels and when to use

| Level | Use when |
|-------|----------|
| `low` | Trivial, mechanical work; minimize latency/cost. |
| `medium` | Routine implementation. |
| `high` | Plan/design/review — multi-step reasoning where rigor beats speed (set on analyst/architect/reviewer/debugger). |
| `xhigh` | Opus-only. Exceptionally hard reasoning; reserve for genuinely gnarly design problems. |
| `max` | Opus-only. Maximum reasoning budget; rarely needed, highest cost. |

### Relationship to ultrathink prose

`effort:` **complements, does not replace**, the existing "Extended Thinking
Triggers" / ultrathink prose in `agents/analyst.md` and `agents/architect.md`.
The prose cues the model to emit extended thinking at the right moments;
`effort: high` raises the baseline reasoning budget declaratively. Keep both.

---

## Cross-model review

The core Top-2 goal is to avoid a model grading its own homework. With explicit
pins the **in-plugin win** is a guaranteed tier gap: `reviewer` is
`claude-opus-5-5`, strictly above `developer` (`claude-sonnet-5-5`). When the
reviewer runs on a higher tier than the implementer it records
`cross_model: true` in its report frontmatter; when an infra fallback collapses
both onto the same tier it records `cross_model: false` (an effective
self-review). See the reviewer report contract in `agents/reviewer.md`.

> **Limitation.** Per-agent *vendor* isolation is not achievable purely via the
> plugin. True cross-**vendor** review (serving the reviewer's slug from a
> non-Anthropic model) is configured on the aiproxy side (see below) and is out
> of scope for the plugin.

---

## aiproxy / litellm contract (infra side — NOT applied by the plugin)

All model traffic flows through `ANTHROPIC_BASE_URL=aiproxy` (litellm). The
plugin emits the explicit slugs `claude-opus-5-5` / `claude-sonnet-5-5` /
`claude-haiku-5-5`; litellm's `model_list` must serve each of them (aliases such
as `opus` are still used by the Task tool `model` argument). To make the tiers
(and optional cross-vendor review) work, the **operator** adds entries on the
aiproxy side. The plugin does **not** write or apply this config.

### 1. Serve the pinned slugs + add a graceful fallback

```yaml
# litellm config.yaml (aiproxy side — illustrative)
model_list:
  - model_name: claude-opus-5-5
    litellm_params:
      model: anthropic/claude-opus-5-5
  - model_name: claude-sonnet-5-5
    litellm_params:
      model: anthropic/claude-sonnet-5-5
  - model_name: claude-haiku-5-5
    litellm_params:
      model: anthropic/claude-haiku-5-5

# If the opus tier is unavailable, degrade gracefully to sonnet so reviews/plans
# still run instead of hard-failing.
router_settings:
  fallbacks:
    - claude-opus-5-5: ["claude-sonnet-5-5"]
```

With this, an unavailable opus backend degrades to sonnet automatically. The
reviewer should then mark `cross_model: false`, since it was effectively served
the same tier as the developer.

### 2. (Optional) TRUE cross-vendor review — aiproxy-only

To route the reviewer's "opus" to a non-Anthropic model for genuine cross-vendor
judgment, point the `claude-opus-5-5` name (or a dedicated review deployment) at another
vendor on the litellm side:

```yaml
# Illustrative ONLY — configured on aiproxy, never emitted by the plugin.
model_list:
  - model_name: claude-opus-5-5
    litellm_params:
      model: openai/gpt-5   # reviewer's slug served by a different vendor
```

This is the only way to achieve cross-vendor isolation; it lives entirely in the
aiproxy/litellm config. The plugin does not configure it.

---

## Cost trade-off

Pinning `analyst`, `architect`, `reviewer`, and `debugger` to `claude-opus-5-5`
(with `effort: high`) raises per-invocation cost for those agents; `gitops` and
`tech-writer` on `claude-haiku-5-5` / `effort: low` lower it. Plan/design/review
are the highest-leverage steps, so the trade is deliberate. To change an agent's
tier, edit its `model:` slug (and `effort:`) — keep `reviewer` strictly above
`developer` to preserve cross-model review.
