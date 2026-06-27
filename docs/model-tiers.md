# Model Tiers & Cross-Model Review

Unifies the **per-phase model tier** (design Top-5) and **cross-model review**
(design Top-2) levers. The plugin expresses tier intent **declaratively in agent
frontmatter** using only the literal model names Claude Code understands; the
actual backend a name maps to is resolved on the aiproxy/litellm side.

> **Capability constraints (verified, Claude Code v2.1.195).** These shape the
> design and are not negotiable from the plugin:
> - `model:` frontmatter does **not** expand environment variables. Only the
>   literals `inherit`, `sonnet`, `opus`, `haiku` are accepted. (The earlier
>   env-alias plan, e.g. `${SCAFFOLDING_PLAN_MODEL}`, is **out** — litellm maps
>   these literal names on the aiproxy side instead.)
> - The Task tool `model` argument accepts only `haiku` / `sonnet` / `opus` — no
>   custom aliases.
> - `effort:` frontmatter **is** supported: `low | medium | high | xhigh | max`
>   (`xhigh` and `max` are Opus-only).

---

## Tier assignment

| Agent | `model:` | `effort:` | Tier intent | Rationale |
|-------|----------|-----------|-------------|-----------|
| `analyst` | `opus` | `high` | Highest-stakes reasoning | Requirements/scope/feasibility — errors here propagate downstream. |
| `architect` | `opus` | `high` | Highest-stakes reasoning | Plan/design is the highest-leverage step ("Opus for plan"). |
| `reviewer` | `opus` | `high` | Cross-model judge | Reviewer on opus judges the developer's (sonnet/inherit) work — breaks same-model self-review. |
| `developer` | `inherit` | — | Implementer tier | Resolves to the session/sonnet default. Unchanged. |
| all other agents | `inherit` | — | Session default | No tier override. |

`inherit` means "use whatever model the session is running on" — it is the
safe default and the only value that guarantees no behavior change.

### `effort:` levels and when to use

| Level | Use when |
|-------|----------|
| `low` | Trivial, mechanical work; minimize latency/cost. |
| `medium` | Routine implementation. |
| `high` | Plan/design/review — multi-step reasoning where rigor beats speed (set on analyst/architect/reviewer). |
| `xhigh` | Opus-only. Exceptionally hard reasoning; reserve for genuinely gnarly design problems. |
| `max` | Opus-only. Maximum reasoning budget; rarely needed, highest cost. |

### Relationship to ultrathink prose

`effort:` **complements, does not replace**, the existing "Extended Thinking
Triggers" / ultrathink prose in `agents/analyst.md` and `agents/architect.md`.
The prose cues the model to emit extended thinking at the right moments;
`effort: high` raises the baseline reasoning budget declaratively. Keep both.

---

## Cross-model review

The core Top-2 goal is to avoid a model grading its own homework. Because the
plugin can only emit literal model names, the **achievable in-plugin win** is the
**tier difference**: the reviewer is pinned to `opus` while the developer runs
`inherit` (session/sonnet tier). When the reviewer runs on a higher tier than the
implementer it records `cross_model: true` in its report frontmatter; when an
infra fallback collapses both onto the same tier it records `cross_model: false`
(an effective self-review). See the reviewer report contract in
`agents/reviewer.md`.

> **Limitation.** Per-agent *vendor* isolation is **not** achievable purely via
> the plugin — Task and frontmatter only accept `haiku`/`sonnet`/`opus`. True
> cross-**vendor** review (routing the reviewer's "opus" to a non-Anthropic
> model) is configured on the aiproxy side (see below) and is out of scope for
> the plugin.

---

## aiproxy / litellm contract (infra side — NOT applied by the plugin)

All model traffic flows through `ANTHROPIC_BASE_URL=aiproxy` (litellm). The
plugin emits the literal names `sonnet` / `opus` / `haiku`; litellm's
`model_list` decides which backend each name reaches. To make the opus tier (and
optional cross-vendor review) work, the **operator** adds entries on the aiproxy
side. The plugin does **not** write or apply this config.

### 1. Map the literal names + add a graceful fallback

```yaml
# litellm config.yaml (aiproxy side — illustrative)
model_list:
  - model_name: opus
    litellm_params:
      model: anthropic/claude-opus-4-1
  - model_name: sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-5

# If the opus tier is unavailable, degrade gracefully to sonnet so reviews/plans
# still run instead of hard-failing.
router_settings:
  fallbacks:
    - opus: ["sonnet"]
```

With this, an unavailable `opus` backend degrades to `sonnet` automatically. The
reviewer should then mark `cross_model: false`, since it was effectively served
the same tier as the developer.

### 2. (Optional) TRUE cross-vendor review — aiproxy-only

To route the reviewer's "opus" to a non-Anthropic model for genuine cross-vendor
judgment, point the `opus` name (or a dedicated review deployment) at another
vendor on the litellm side:

```yaml
# Illustrative ONLY — configured on aiproxy, never emitted by the plugin.
model_list:
  - model_name: opus
    litellm_params:
      model: openai/gpt-5   # reviewer's "opus" served by a different vendor
```

This is the only way to achieve cross-vendor isolation; it lives entirely in the
aiproxy/litellm config. The plugin cannot express it (frontmatter accepts only
`haiku`/`sonnet`/`opus`).

---

## Cost trade-off

Pinning `analyst`, `architect`, and `reviewer` to `opus` (with `effort: high`)
raises per-invocation cost for those three agents versus the previous all-`inherit`
default. This is a deliberate trade — plan/design/review are the highest-leverage
steps. To revert any agent to the cheaper default, change its `model:` field back
to `inherit` (and drop the `effort:` line). No other change is required; `inherit`
restores the exact prior behavior.
