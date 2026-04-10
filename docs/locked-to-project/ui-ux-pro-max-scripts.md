# ui-ux-pro-max scripts + data

## What it is

The `ui-ux-pro-max` skill is a design intelligence system with two parts:

1. **Markdown SKILL.md** -- guidelines, rules, checklists (shipped in
   `scaffolding` at `skills/ui-ux-pro-max/SKILL.md`).
2. **Python scripts + CSV database** -- `scripts/core.py`,
   `scripts/design_system.py`, `scripts/search.py` plus `data/stacks/*.csv`
   containing 96 color palettes, 57 font pairings, 67 styles, 99 UX rules
   and 25 chart types. This part stays in the origin repo.

## Why not in scaffolding

The scripts and CSV data are tightly coupled to the origin repository:

- Python scripts expect a fixed layout (`skills/ui-ux-pro-max/scripts/`,
  `skills/ui-ux-pro-max/data/`). Copying them into a fresh `.claude/` tree
  without the data directory produces import errors.
- The CSV database is large (thousands of rows) and mutates independently
  from the markdown guidelines. Embedding it in every clone of `scaffolding`
  would bloat the repo and force users to pull irrelevant data.
- Runtime is Python 3 with no other deps, but users need a specific invocation
  pattern (`python3 skills/ui-ux-pro-max/scripts/search.py ...`) that does
  not port cleanly to projects with different directory conventions.

The markdown `SKILL.md` in `scaffolding` has a "Tool Availability" section
that instructs the agent to degrade gracefully: if `scripts/search.py` is not
present, the agent falls back to the rules documented inline in `SKILL.md`
(which are a condensed version of the same knowledge).

## How to enable in your project

If you want the full CLI-driven design system in your own repo:

1. Copy `skills/ui-ux-pro-max/scripts/` and `skills/ui-ux-pro-max/data/` from
   the origin `scaffolding.tool` checkout into your project.
2. Ensure `python3` is available (no pip deps required).
3. Invoke via bash: `python3 path/to/skills/ui-ux-pro-max/scripts/search.py
   "query" --design-system`.
4. Optional: add a `/search-design` slash command that wraps the bash call.

For most projects the condensed rules already in `SKILL.md` are sufficient --
colour tokens, spacing scale, typography recommendations and the
pre-delivery checklist are all inline. Only reach for the CLI if you need the
full searchable database.
