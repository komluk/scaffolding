---
name: doctor
description: Health-check the scaffolding install and report install problems plus exact fixes (diagnose-only, never mutates).
---

# /doctor Command

Run a health check of the scaffolding plugin install and report problems with the
exact command to fix each one. Diagnoses the documented first-run gotchas (the #1
being `Agent type 'scaffolding:...' not found` after a fresh install) and groups
findings by severity.

## Usage

```
/doctor
```

Run from any project. No arguments. Safe to run repeatedly.

## Guardrail — DIAGNOSE ONLY (never mutate)

This command **only diagnoses and prints fixes**. It MUST NEVER:
- run `/reload-plugins`, `/plugin install/update`, or restart anything itself
- edit `settings.json`, `CLAUDE.md`, `.gitignore`, or any user/project file
- `chmod`, `mkdir`, `cp`, register an MCP server, or set an env var

It only reads files, runs read-only shell, and spawns **one trivial probe agent**
(check #2). Print the exact command for the *user* to run — matches the
propose-don't-mutate posture of `/memory`.

## Steps

Follow these steps exactly, in order.

### Step A — Run the inline health-check bash block

Run the block below verbatim. It performs the file/shell checks (#1, #3–#10) and
prints a grouped report. It writes nothing.

```bash
# ---- scaffolding /doctor — read-only health check ----
BLOCKING=0; RECOMMENDED=0; OPTIONAL=0
pass() { printf '  [PASS] %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n        fix: %s\n' "$1" "$2"; }

# Locate the installed plugin root (same multi-base discovery as /init-scaffolding)
PLUGIN_ROOT=""
find_plugin_root() {
  local base="$1"; [ -d "$base" ] || return
  local latest
  latest=$(find "$base" -name "CLAUDE.md" -path "*/scaffolding/*/CLAUDE.md" 2>/dev/null | sort -V | tail -1 | xargs dirname 2>/dev/null || true)
  if [ -n "$latest" ] && [ -f "$latest/CLAUDE.md" ]; then echo "$latest"; return; fi
  latest=$(find "$base" -name "CLAUDE.md" 2>/dev/null | sort -V | tail -1 | xargs dirname 2>/dev/null || true)
  if [ -n "$latest" ] && [ -f "$latest/CLAUDE.md" ]; then echo "$latest"; return; fi
}
# Prefer the env var Claude Code injects when the plugin is loaded
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/CLAUDE.md" ]; then
  PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"
fi
if [ -z "$PLUGIN_ROOT" ]; then
  for base in \
    "$HOME/.claude/plugins/cache/komluk-scaffolding" \
    "$HOME/.claude/plugins/marketplaces/komluk-scaffolding" \
    "${USERPROFILE:-}/.claude/plugins/cache/komluk-scaffolding" \
    "${LOCALAPPDATA:-}/claude/plugins/cache/komluk-scaffolding"; do
    [ -n "$base" ] || continue
    found=$(find_plugin_root "$base")
    if [ -n "$found" ]; then PLUGIN_ROOT="$found"; break; fi
  done
fi

echo "=== BLOCKING (install will not work until these pass) ==="

# Check 1 — plugin installed / loaded
if [ -n "$PLUGIN_ROOT" ] && [ -f "$PLUGIN_ROOT/CLAUDE.md" ]; then
  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    pass "Plugin installed & loaded (CLAUDE_PLUGIN_ROOT set; root: $PLUGIN_ROOT)"
  else
    pass "Plugin installed (cache root: $PLUGIN_ROOT)"
    echo "        note: CLAUDE_PLUGIN_ROOT not set in this shell — fine for /doctor, but if hooks misbehave, restart Claude Code."
  fi
else
  BLOCKING=$((BLOCKING+1))
  fail "Plugin not installed / not found" "/plugin marketplace add komluk/scaffolding   then   /plugin install scaffolding@komluk-scaffolding"
fi

# Check 1b — agent files present (11) — needed for resolution
if [ -n "$PLUGIN_ROOT" ]; then
  AGENT_COUNT=$(find "$PLUGIN_ROOT/agents" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$AGENT_COUNT" = "11" ]; then
    pass "All 11 agent definitions present in plugin root"
  else
    BLOCKING=$((BLOCKING+1))
    fail "Incomplete install — found ${AGENT_COUNT:-0}/11 agent files" "/plugin update scaffolding@komluk-scaffolding   then   /reload-plugins"
  fi
fi

# Check 4 — plugin.json valid + hooks registered
if [ -n "$PLUGIN_ROOT" ]; then
  PJ="$PLUGIN_ROOT/.claude-plugin/plugin.json"
  [ -f "$PJ" ] || PJ="$PLUGIN_ROOT/plugin.json"
  if [ -f "$PJ" ] && python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert d.get('hooks')" "$PJ" 2>/dev/null; then
    pass "plugin.json valid and hooks registered"
  else
    BLOCKING=$((BLOCKING+1))
    fail "plugin.json missing/invalid or no hooks registered" "/plugin update scaffolding@komluk-scaffolding   then   /reload-plugins"
  fi
fi

echo ""
echo "=== RECOMMENDED (protocol / hooks / memory tiers) ==="

# Check 3a — settings.json present in plugin root
if [ -n "$PLUGIN_ROOT" ] && [ -f "$PLUGIN_ROOT/settings.json" ] \
   && python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$PLUGIN_ROOT/settings.json" 2>/dev/null; then
  pass "settings.json present and valid in plugin root"
else
  RECOMMENDED=$((RECOMMENDED+1))
  fail "settings.json missing or unparseable in plugin root" "/plugin update scaffolding@komluk-scaffolding (reinstall)"
fi

# Check 3b — hook .sh files present + executable (9 plugin-registered hooks; refresh-mcp-token.sh is opt-in)
if [ -n "$PLUGIN_ROOT" ] && [ -d "$PLUGIN_ROOT/hooks" ]; then
  NONEXEC=$(find "$PLUGIN_ROOT/hooks" -maxdepth 1 -name '*.sh' ! -perm -u+x 2>/dev/null | wc -l | tr -d ' ')
  SH_COUNT=$(find "$PLUGIN_ROOT/hooks" -maxdepth 1 -name '*.sh' 2>/dev/null | wc -l | tr -d ' ')
  if [ "${NONEXEC:-0}" = "0" ] && [ "${SH_COUNT:-0}" -gt 0 ]; then
    pass "All $SH_COUNT hook scripts present and executable"
  else
    RECOMMENDED=$((RECOMMENDED+1))
    fail "$NONEXEC hook script(s) not executable — hooks will silently no-op" "chmod +x \"$PLUGIN_ROOT/hooks/\"*.sh   (or reinstall the plugin)"
  fi
else
  RECOMMENDED=$((RECOMMENDED+1))
  fail "hooks/ directory not found in plugin root" "/plugin update scaffolding@komluk-scaffolding (reinstall)"
fi

# Check 5 — in-repo CLAUDE.md (per-project routing)
if [ -f "./CLAUDE.md" ]; then
  pass "In-repo CLAUDE.md present — routing protocol travels to this repo"
  # Check 5b — routing section intact (HARD INVARIANT: never relocate routing
  # into nested CLAUDE.md). Guards against Item 1 extraction gone wrong.
  if grep -q 'subagent_type="scaffolding:' "./CLAUDE.md" 2>/dev/null; then
    pass "Routing section present in ./CLAUDE.md (always-loaded protocol intact)"
  else
    RECOMMENDED=$((RECOMMENDED+1))
    fail "./CLAUDE.md is missing the routing protocol (Task subagent_type=\"scaffolding:...\")" "restore the Protocol + Decision Tree + Agents table to the project-root CLAUDE.md — routing must stay always-loaded, never only in a nested CLAUDE.md"
  fi
else
  RECOMMENDED=$((RECOMMENDED+1))
  fail "No ./CLAUDE.md — agent routing protocol won't apply in this project" "/init-scaffolding"
fi

# Check 5c — skills: references resolve + every skill has a description
# (orchestration contract, Item 4). Validates the plugin install, not the repo.
if [ -n "$PLUGIN_ROOT" ] && [ -d "$PLUGIN_ROOT/agents" ] && [ -d "$PLUGIN_ROOT/skills" ]; then
  SKILL_ISSUES=$(python3 - "$PLUGIN_ROOT" <<'PY' 2>/dev/null || echo "ERR"
import os, re, sys
root = sys.argv[1]
problems = []
skills_dir = os.path.join(root, "skills")
# Every skill must have a non-empty description in its frontmatter.
for name in sorted(os.listdir(skills_dir)):
    sk = os.path.join(skills_dir, name, "SKILL.md")
    if not os.path.isfile(sk):
        continue
    head = open(sk, encoding="utf-8", errors="ignore").read()[:4000]
    if not re.search(r'(?m)^description:\s*\S', head):
        problems.append(f"skill '{name}' has no description:")
# Every skills: reference in an agent must exist on disk.
agents_dir = os.path.join(root, "agents")
for fn in sorted(os.listdir(agents_dir)):
    if not fn.endswith(".md"):
        continue
    txt = open(os.path.join(agents_dir, fn), encoding="utf-8", errors="ignore").read()
    m = re.search(r'(?ms)^skills:\s*\n((?:\s*-\s*\S+\s*\n)+)', txt)
    if not m:
        continue
    for ref in re.findall(r'-\s*([A-Za-z0-9_-]+)', m.group(1)):
        if not os.path.isfile(os.path.join(skills_dir, ref, "SKILL.md")):
            problems.append(f"agent '{fn}' references missing skill '{ref}'")
print("\n".join(problems))
PY
)
  if [ -z "$SKILL_ISSUES" ]; then
    pass "All agent skills: references resolve and every skill has a description"
  elif [ "$SKILL_ISSUES" = "ERR" ]; then
    : # python failed — skip silently, this is a soft check
  else
    RECOMMENDED=$((RECOMMENDED+1))
    fail "Orchestration contract issues: $(echo "$SKILL_ISSUES" | tr '\n' ';')" "fix the named skill description(s) / agent skills: reference(s) in the plugin source"
  fi
fi

# Check 6 — .scaffolding/ present (file-based memory tiers)
if [ -d "./.scaffolding" ]; then
  pass ".scaffolding/ present — file-based memory tiers can persist"
else
  RECOMMENDED=$((RECOMMENDED+1))
  fail "No ./.scaffolding/ — file-based agent memory can't be written" "/init-scaffolding"
fi

echo ""
echo "=== OPTIONAL (opt-in cross-device semantic memory) ==="

# Check 7 — MCP semantic-memory configured (opt-in — never a failure if absent)
if command -v claude >/dev/null 2>&1 && claude mcp list 2>/dev/null | grep -qi 'semantic-memory'; then
  pass "semantic-memory MCP wired"
  # Check 8 — token only matters once #7 is wired
  if [ -n "${MEMORY_MCP_TOKEN:-}" ]; then
    pass "MEMORY_MCP_TOKEN is set"
  else
    OPTIONAL=$((OPTIONAL+1))
    fail "semantic-memory wired but MEMORY_MCP_TOKEN unset — calls will 401" "export MEMORY_MCP_TOKEN=...   then   /memory status"
  fi
else
  echo "  [SKIP] semantic-memory MCP not wired — OPTIONAL, off by default."
  echo "         enable cross-device memory with: /memory enable   (skip if not wanted)"
fi

echo ""
echo "=== SUMMARY (bash checks) ==="
echo "  Blocking: $BLOCKING   Recommended: $RECOMMENDED   Optional: $OPTIONAL"
echo "  Next: run Step B (live agent-resolution probe) — the #1 first-run check."
# ---- end health check ----
```

### Step B — Live agent-resolution probe (BLOCKING check #2)

This is the highest-value check and the one bash cannot do: confirm the agents
actually **resolve** in this session. A fresh install that hasn't run
`/reload-plugins` will pass every bash check above but still fail here with
`Agent type 'scaffolding:analyst' not found`.

Spawn exactly one trivial probe:

```
Task(subagent_type="scaffolding:analyst", prompt="Reply with the single word: OK. Do nothing else.")
```

Interpret the result:

- **Probe returns (any output, e.g. "OK")** -> `[PASS] Agents resolve — scaffolding:<agent> names work this session.`
- **Error `Agent type ... not found` / `Unknown agent`** ->
  `[FAIL] Agents not loaded into this session.`
  `      fix: run  /reload-plugins   (or fully restart Claude Code), then /doctor again.`
- **Error mentions a bare name** (e.g. you tried `analyst` without the prefix) ->
  remind: agents MUST be invoked fully-qualified as `scaffolding:<name>`
  (e.g. `scaffolding:developer`), never bare `developer`.

Do the probe only once. If it fails, that failure **is** the diagnosis — do not retry.

### Step C — Print the final grouped report

Combine Step A's bash output with the Step B probe result into one report:

```
scaffolding /doctor
====================
BLOCKING
  [PASS/FAIL] Plugin installed/loaded            — <fix if FAIL>
  [PASS/FAIL] Agents resolve (live probe)        — /reload-plugins if FAIL
  [PASS/FAIL] 11 agent definitions present       — <fix if FAIL>
  [PASS/FAIL] plugin.json valid + hooks wired    — <fix if FAIL>
RECOMMENDED
  [PASS/FAIL] settings.json valid                — <fix if FAIL>
  [PASS/FAIL] hook scripts executable            — <fix if FAIL>
  [PASS/FAIL] in-repo CLAUDE.md                  — /init-scaffolding if FAIL
  [PASS/FAIL] .scaffolding/ present              — /init-scaffolding if FAIL
OPTIONAL
  [PASS/SKIP] semantic-memory MCP                — /memory enable (opt-in)
  [PASS/FAIL] MEMORY_MCP_TOKEN (only if wired)   — export token if FAIL

Summary: <N> blocking, <M> recommended, <K> optional issue(s).
Top fix: <the single most important remediation, e.g. "run /reload-plugins">
```

End with a one-line summary. If there are blocking issues, lead the summary with
the single most impactful fix (almost always `/reload-plugins` for a fresh
install). If everything passes, state: `All checks pass — install is healthy.`

## Notes

- **Namespace sanity**: agents are always invoked fully-qualified as
  `scaffolding:<name>` (e.g. `scaffolding:developer`), never the bare name. A bare
  name is the #2 documented gotcha and surfaces as "Agent type not found" in
  Step B.
- **Stale cache / version mismatch**: if Step B fails but every bash check passes,
  the plugin loaded into the cache but not into the running session — the fix is
  `/reload-plugins` or a full restart, not a reinstall.
- `refresh-mcp-token.sh` lives in `hooks/` but is an opt-in user-scope hook copied
  by `/memory enable`; it is intentionally **not** registered in `plugin.json`, so
  the hook-registration check does not expect it.
- This command ships no separate script and adds no hook — it is fully
  self-contained and dependency-free (bash + `python3` for JSON parsing, both
  already required by `/init-scaffolding` and `/memory`).
