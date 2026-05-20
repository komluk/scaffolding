---
name: skill-authoring
description: "Methodology for authoring scaffolding-compatible skills: frontmatter contract, body structure, validation. TRIGGER when: running /create-skill, writing or reviewing a SKILL.md file, or deciding if a procedure deserves its own skill. SKIP: distilling a conversation into candidates (use distill); 3-tier memory writes (use agent-memory)."
---

# Skill Authoring Skill

## Purpose

Methodology for authoring scaffolding-compatible skills. A skill is a single
`SKILL.md` file under `skills/<name>/` that encodes a reusable methodology Claude
Code can auto-invoke. This skill defines the frontmatter contract, the recommended
body structure, the description-writing rules, and the quality bar every authored
skill must meet before it ships.

## When to Apply

Apply this skill when:

- Running the `/create-skill` command to scaffold a new skill
- Hand-writing or editing a `skills/<name>/SKILL.md` file
- Reviewing a skill for frontmatter correctness or auto-invocation quality
- Deciding whether a repeatable procedure deserves promotion into its own skill

Do NOT apply this skill for:

- Distilling a conversation into knowledge candidates — use `distill`
- Writing into the 3-tier file memory — use `agent-memory`

---

## Frontmatter Contract

Every `SKILL.md` MUST begin with a YAML frontmatter block delimited by `---`:

| Field | Rule |
|-------|------|
| `name` | Required. Kebab-case `^[a-z][a-z0-9-]*$`. MUST equal the parent directory name. |
| `description` | Required. Non-empty, 1–340 characters. Follows the Description Contract below. |

No other frontmatter fields are used by scaffolding skills. The `name` /
directory-name match is mechanically enforced by `validators/validate-skill.sh`.

---

## Description Contract

The `description` field drives Claude Code's automatic skill invocation. A vague
or overbroad description either fails to trigger or triggers on the wrong tasks.
Every scaffolding skill `description` MUST follow this template:

```
"<one-line capability summary>. TRIGGER when: <2-4 concrete observable situations>. SKIP: <1-2 cases handled by a named neighbour skill or out of scope>."
```

Rules:

| Rule | Detail |
|------|--------|
| Length cap | Keep the whole string under ~340 characters. Trim the summary first. |
| Observable triggers | Use observable verbs/nouns ("writing a migration"), not adjectives ("complex DB work"). |
| 2–4 triggers | Fewer than 2 under-triggers; more than 4 dilutes the match. |
| Named `SKIP` | Name the competing neighbour skill — e.g. `SKIP: ... (use python-patterns)`. |
| Mutual `SKIP` | If skill A's `SKIP` names skill B, skill B's `SKIP` SHOULD name skill A. No two skills' `TRIGGER` clauses may overlap without a mutual disambiguating `SKIP`. |
| Under-trigger bias | For borderline cases, prefer under-triggering over false activations. |

When a skill has no overlapping neighbour, the `SKIP` clause may instead name an
explicitly out-of-scope case. The `/create-skill` command composes this string
automatically from the collected inputs.

---

## Recommended Body Structure

A skill body should read top-to-bottom as a methodology, not as prose. Use this
section order:

| Order | Section | Content |
|-------|---------|---------|
| 1 | `## Purpose` | One short paragraph: what the skill encodes and the outcome. |
| 2 | `## When to Apply` | Bulleted TRIGGER situations, then explicit SKIP cases. |
| 3 | Methodology section(s) | The repeatable procedure — prefer decision tables. |
| 4 | `## Anti-Patterns` | Table of common mistakes and their corrections. |
| 5 | `## Quality Checklist` | Verifiable completion criteria. |

Guidelines:

- Prefer tables for decision matrices and checklists; keep prose minimal.
- Each section earns its place — delete empty scaffolding.
- Scaffold new skills from `templates/skill-template.md`.

---

## The 500-Line Rule

A `SKILL.md` file MUST stay **under 500 lines**. Auto-injected skill context is
bounded; an oversized skill is silently truncated and loses its tail content. If a
skill approaches the limit, split it into two narrower skills with distinct
`TRIGGER`/`SKIP` clauses rather than letting one file sprawl.

---

## Quality Checklist

Before a new or edited skill ships:

- [ ] Frontmatter block present and delimited by `---`
- [ ] `name` is kebab-case and equals the parent directory name
- [ ] `description` follows the Description Contract and is under 340 chars
- [ ] Body has `## Purpose`, `## When to Apply`, a methodology section, and `## Anti-Patterns`
- [ ] File is under 500 lines
- [ ] Every neighbour skill that overlaps is named in a mutual `SKIP` clause
- [ ] `bash validators/validate-skill.sh skills/<name>/SKILL.md` exits 0
- [ ] tech-writer task queued to add the skill to `README.md` / `CHANGELOG.md` and bump `plugin.json` counts
