# Adopting scaffolding in an existing project

If your project already has its own `.claude/` directory with custom agents,
skills, or hooks, here's how to layer `scaffolding` on top without losing your
local work.

## How Claude Code merges configuration

Claude Code reads configuration from two locations and merges them:

- **User-level** (`~/.claude/`) — applies to every project on the machine.
- **Project-level** (`<project>/.claude/`) — applies to that project only.

When a name collides (e.g. both define `agents/developer.md`), the
project-level file wins. Skills and agents that exist only at user level remain
visible in every project.

The plugin lives at user level (`~/.claude/plugins/marketplaces/komluk-scaffolding/`),
so it is **automatically additive** — your project's `.claude/` is untouched
unless you run `/init-scaffolding` inside the project.

## Recommended flow

```
1. /plugin marketplace add komluk/scaffolding
2. /plugin install scaffolding@komluk-scaffolding
3. /reload-plugins
```

After this, every project on the machine gets `scaffolding`'s 11 agents,
31 skills, 15 commands, and 8 hooks via the plugin runtime, namespaced as
`scaffolding:<agent>`. Project-level files in `<project>/.claude/agents/` are
unaffected and continue to be available as bare names.

**Pros:** zero risk of overwriting existing files. Updates are atomic via
`/plugin update`.

**Cons:** the plugin's defaults (`pytest`, `npm test`, etc.) are baked in. If
you need per-project values, see "Per-project overrides" below.

## When to also run `/init-scaffolding`

Run it inside the project root if any of these apply:

- The project is a team repo, and you want `CLAUDE.md` (the routing protocol)
  versioned in git so collaborators without the plugin still get it.
- CI or automation reads the repo and needs a committed `CLAUDE.md` for
  reproducible context.
- You want `scaffolding`'s hooks (`session-start-protocol`, `pre-commit-validation`,
  etc.) to live in `.claude/hooks/` of the project.

`/init-scaffolding` is idempotent — safe to re-run. It always overwrites
`CLAUDE.md`, `settings.json`, and `hooks/*.sh` with the latest plugin version,
and creates `.scaffolding/` (added to `.gitignore` automatically).

If the project already has its own `CLAUDE.md`, **back it up first** — the
command will overwrite:

```bash
cd /path/to/your/project
cp CLAUDE.md CLAUDE.md.backup
# Then in Claude Code:
#   /init-scaffolding
diff CLAUDE.md.backup CLAUDE.md   # review what changed
```

## Per-project overrides

The plugin's defaults can be overridden by editing values in the project's
`CLAUDE.md` after `/init-scaffolding`. Common overrides:

- Backend test command (default: `pytest`)
- Frontend validate command (default: `npm test`)
- SonarQube project key (default: empty)
- Project name (default: `(project)`)

Edit `CLAUDE.md` directly — those values are no longer parametrized at install
time as of v2.0.0.

## Resolving conflicts

If your project already has a file with the same path that scaffolding would
write, decide on a per-file basis:

| File | Recommendation |
|------|----------------|
| `CLAUDE.md` | Merge — scaffolding's routing protocol is the value-add; keep your project-specific instructions appended below it. |
| `.claude/settings.json` | Merge — scaffolding's hooks + permissions block can live alongside your custom env vars. Use `jq` to splice. |
| `.claude/hooks/<name>.sh` | Keep your version if it does more than scaffolding's; otherwise replace. Conflicts are rare. |
| `.claude/agents/<name>.md` | Project-level wins; the plugin version remains accessible as `scaffolding:<name>`. |

There is no automated merge — `/init-scaffolding` just overwrites. Plan
accordingly with `git diff` review before committing.
