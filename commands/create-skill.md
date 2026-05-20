# /create-skill Command

Scaffold a new scaffolding-compatible skill: an interactive flow that creates
`skills/<name>/SKILL.md` from the canonical template, composes a `TRIGGER`/`SKIP`
description, and validates the result.

## Usage

```
/create-skill
```

Run from the root of the cloned `scaffolding` plugin repository (the directory
containing `skills/`, `commands/`, and `validators/`).

## What It Does

1. Locates the plugin root (so the template and validator can be found)
2. Collects skill inputs interactively (name, purpose, triggers, SKIP neighbours)
3. Validates the name is kebab-case and not already taken
4. Scaffolds `skills/<name>/SKILL.md` from `templates/skill-template.md`
5. Composes the `description` frontmatter per the Description Contract
6. Runs `validators/validate-skill.sh` and reports pass/fail
7. Hands off to tech-writer for README/CHANGELOG and manifest updates

Apply the `skill-authoring` skill throughout — it owns the frontmatter contract,
body structure, and the Description Contract referenced below.

## Steps

Follow these steps exactly.

### 1. Find the plugin root directory

```bash
PLUGIN_ROOT=""

find_plugin_root() {
  local base="$1"
  [ -d "$base" ] || return
  local latest
  latest=$(find "$base" -name "CLAUDE.md" -path "*/scaffolding/*/CLAUDE.md" 2>/dev/null | sort -V | tail -1 | xargs dirname 2>/dev/null || true)
  if [ -n "$latest" ] && [ -f "$latest/CLAUDE.md" ]; then echo "$latest"; return; fi
  latest=$(find "$base" -name "CLAUDE.md" 2>/dev/null | sort -V | tail -1 | xargs dirname 2>/dev/null || true)
  if [ -n "$latest" ] && [ -f "$latest/CLAUDE.md" ]; then echo "$latest"; return; fi
}

# If the current directory is itself a plugin checkout, prefer it.
if [ -d "skills" ] && [ -d "validators" ] && [ -f "templates/skill-template.md" ]; then
  PLUGIN_ROOT="$(pwd)"
fi

if [ -z "$PLUGIN_ROOT" ]; then
  for base in \
    "$HOME/.claude/plugins/cache/komluk-scaffolding" \
    "$HOME/.claude/plugins/marketplaces/komluk-scaffolding"; do
    found=$(find_plugin_root "$base")
    if [ -n "$found" ]; then PLUGIN_ROOT="$found"; break; fi
  done
fi

echo "Plugin root: ${PLUGIN_ROOT:-NOT FOUND}"
```

If `PLUGIN_ROOT` is empty, report that the plugin checkout was not found and stop.

### 2. Collect skill inputs

Prompt the user for, and record into shell variables:

- `SKILL_NAME` — the new skill name (kebab-case, e.g. `cache-strategy`)
- `SKILL_PURPOSE` — a one-line capability summary
- `SKILL_TRIGGERS` — 2 to 4 concrete, observable situations that should
  auto-invoke the skill
- `SKILL_SKIP` — optional: 1–2 neighbouring skill names that handle adjacent
  concerns, each with the case it owns

If the user supplies fewer than 2 triggers, ask again — under-specified triggers
make auto-invocation unreliable.

### 3. Validate the skill name

```bash
if ! echo "$SKILL_NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
  echo "ABORT: '$SKILL_NAME' is not kebab-case (^[a-z][a-z0-9-]*\$)"
  exit 1
fi

if [ -d "$PLUGIN_ROOT/skills/$SKILL_NAME" ]; then
  echo "ABORT: skills/$SKILL_NAME already exists — choose a different name."
  echo "No files were written."
  exit 1
fi

echo "Name OK: $SKILL_NAME"
```

On either failure, stop immediately and write no files.

### 4. Scaffold the skill from the template

```bash
mkdir -p "$PLUGIN_ROOT/skills/$SKILL_NAME"
cp "$PLUGIN_ROOT/templates/skill-template.md" \
   "$PLUGIN_ROOT/skills/$SKILL_NAME/SKILL.md"
echo "CREATED: skills/$SKILL_NAME/SKILL.md (from template)"
```

Then use the Edit tool to substitute the template placeholders:

- `SKILL_NAME` → the kebab-case name
- `SKILL_TITLE` → the name in Title Case
- `ONE_LINE_SUMMARY` → `SKILL_PURPOSE`
- `TRIGGER situation 1..3` → the collected trigger situations
- `SKIP case 1..2` / `NEIGHBOUR_SKILL` → the collected SKIP neighbours
- Methodology table, Anti-Patterns, Quality Checklist → real content for the skill

### 5. Compose the description frontmatter

Replace the `description:` line with a string built per the **Description
Contract** in `skills/skill-authoring/SKILL.md`:

```
"<one-line summary>. TRIGGER when: <2-4 observable situations>. SKIP: <1-2 named-neighbour cases>."
```

Rules: cap at ~340 characters; use observable verbs/nouns, not adjectives; name
the competing neighbour skill in `SKIP`. If no neighbour overlaps, the `SKIP`
clause may name an out-of-scope case instead.

### 6. Validate the new skill

```bash
bash "$PLUGIN_ROOT/validators/validate-skill.sh" \
  "$PLUGIN_ROOT/skills/$SKILL_NAME/SKILL.md"
```

If it exits non-zero, report each reported error and fix the file (description
length, missing heading, name mismatch). Do not leave a half-written invalid
skill — either fix it or remove the directory and abort.

### 7. Hand off to tech-writer

Print a summary and instruct the user to route a tech-writer task to:

- Add the new skill to `README.md` and `CHANGELOG.md`
- Bump the skill count in `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`

## Notes

- This command is additive — it only creates one new skill directory.
- Manifest count bumps are left to the tech-writer hand-off so manifest changes
  stay auditable in a single reviewable diff.
- If validation fails and cannot be fixed, remove `skills/<name>/` so no invalid
  skill is left behind.
