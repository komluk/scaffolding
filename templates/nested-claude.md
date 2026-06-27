<!--
  Nested CLAUDE.md template (scaffolding Item 1 — path-scoped rules).

  WHAT THIS IS
  A CLAUDE.md placed in a SUBDIRECTORY is auto-loaded by Claude Code ONLY when it
  is working on files under that directory tree. This is the native, supported
  "load-only-when-relevant" mechanism — no custom paths: glob engine is involved.

  HOW TO USE
  Copy this file to a subdirectory as `CLAUDE.md`, e.g.:
    frontend/CLAUDE.md      (loads when editing under frontend/)
    backend/app/CLAUDE.md   (loads when editing under backend/app/)
  Fill in ONLY path-specific code conventions for that area. Delete the unused
  placeholders. Keep it short — this is lazy context, not a second routing table.

  HARD INVARIANT — DO NOT MOVE ROUTING HERE
  The routing Protocol + Decision Tree + Agents table live ONLY in the project
  ROOT CLAUDE.md and stay always-loaded. Routing must fire on the first message,
  before any file is touched; a nested file only loads on Edit/Write under its
  tree, which is too late to route. NEVER relocate routing into a nested file.
  Only path-specific conventions (types location, stack notes, per-area style)
  belong here.

  REVERSIBLE: this is opt-in relocation. To undo, move the conventions back into
  the root CLAUDE.md and delete the nested file. Nothing is deleted, only moved.
-->

# <Area> conventions

> Auto-loaded only while editing files under this directory. Path-specific code
> conventions only — routing stays in the project-root CLAUDE.md.

## Stack

- <language / framework / runtime for this area>

## Conventions

- <e.g. Types in types/index.ts>
- <e.g. Components are functional + TypeScript; use `import type`>
- <e.g. Services follow the repository pattern; async/await throughout>

## Local commands

| Action | Command |
|--------|---------|
| Test | `<command>` |
| Lint/format | `<command>` |
| Build | `<command>` |
