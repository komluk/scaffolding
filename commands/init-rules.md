---
name: init-rules
description: Scaffold opt-in path-scoped nested CLAUDE.md rule files into the project to lazy-load per-area conventions while keeping routing always-loaded.
---

# /init-rules Command

Scaffold **path-scoped nested `CLAUDE.md`** files into the current project so that
per-area code conventions load **only when Claude works on files under that
directory** — trimming always-loaded context without weakening routing.

This is a **generator**: it writes nested `CLAUDE.md` files into the USER project
(e.g. `frontend/CLAUDE.md`), not into the plugin. It is **opt-in and reversible**
— conventions are *relocated*, never deleted.

## Usage

```
/init-rules [subdir ...]
```

If no subdirs are given, propose candidate areas (e.g. `frontend/`, `backend/`,
`app/`, `src/`) detected in the repo and ask which to scaffold.

## Mechanism (native — no custom engine)

Claude Code natively auto-loads a `CLAUDE.md` placed in a subdirectory **only**
when working on files under that tree. `/init-rules` uses exactly this primitive;
it does **not** build a `paths:` glob matcher or a hook injector.

## HARD INVARIANT — routing never moves

The routing **Protocol + Decision Tree + Agents table** stay in the project-root
`CLAUDE.md`, always-loaded. Routing must fire on the first message before any
file is edited; a nested file only loads on Edit/Write under its tree — too late
to route. This command:

- **MUST NOT** copy, move, or delete the routing sections from the root CLAUDE.md.
- **MUST NOT** overwrite an existing nested `CLAUDE.md` (idempotent — skip if present).
- Only **path-specific code conventions** (types location, stack notes, per-area
  style) are candidates to relocate into nested files.

## Steps

Follow these steps exactly.

### 1. Locate the plugin root

Reuse the same discovery as `/init-scaffolding` (search the marketplace cache
paths) to find `PLUGIN_ROOT`. If not found, stop and tell the user to run
`/plugin install scaffolding@komluk-scaffolding` first.

### 2. Resolve target subdirs

Use the args if given. Otherwise detect candidate area directories and confirm
with the user before writing anything.

### 3. Scaffold a nested CLAUDE.md per target (idempotent)

For each chosen `<subdir>`:

```bash
if [ -f "<subdir>/CLAUDE.md" ]; then
  echo "SKIPPED: <subdir>/CLAUDE.md already exists (not overwritten)"
else
  cp "$PLUGIN_ROOT/templates/nested-claude.md" "<subdir>/CLAUDE.md"
  echo "CREATED: <subdir>/CLAUDE.md (fill in path-specific conventions)"
fi
```

Then help the user fill in the template's `Stack` / `Conventions` / `Local
commands` sections with the conventions that apply to that area — moving them out
of the root `CLAUDE.md` if they are purely path-specific.

### 4. Keep a one-line pointer in the root CLAUDE.md (optional, safe)

If a critical convention (e.g. type centralization) is relocated, leave a brief
one-line pointer in the root `CLAUDE.md` so it is still discoverable when editing
via an absolute path outside the nested tree. Do this via the tech-writer/owner
of CLAUDE.md — do not silently rewrite routing.

### 5. Report

List each target as CREATED or SKIPPED with its path, and remind the user that:

- nested files load only while editing under their directory,
- routing remains always-loaded in the root CLAUDE.md,
- the change is reversible (move conventions back and delete the nested file),
- run `/doctor` to confirm the routing section is still intact in the root CLAUDE.md.

## Notes

- Idempotent: safe to re-run; existing nested files are never overwritten.
- Reversible: relocation only — nothing is deleted from the root CLAUDE.md by
  this command.
- See `docs/adopting-in-legacy-repo.md` for the full extraction procedure and
  `skills/context-engineering/SKILL.md` for the always-loaded-vs-lazy split.
