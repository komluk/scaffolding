---
name: agent-comms
description: "Inter-agent SendMessage recipient validation and worktreePath safety (CWE-59). TRIGGER when: an agent validates a SendMessage `to:` recipient against the agent whitelist, or validates a `worktreePath` received from another agent before acting on it. SKIP: routing/handoff topology decisions (see each agent's own Comms Protocol block); branch/commit/merge operations (use git-operations); worktree lifecycle recovery (use worktree-management)."
---

# Agent Comms Skill

## Purpose
Single source of truth for the two security-critical validation routines every
fan-out agent performs over inter-agent messages:

1. **Recipient validation** — never SendMessage to an unverified `to:` value.
2. **worktreePath validation** — never `cd` into or act on an unverified path
   (gitops and reviewer only).

Each agent keeps a compact 3-4 line inline rule so the logic survives even when
this skill is not loaded; the full algorithm and test cases live here.

---

## 1. Recipient Validation (ALL fan-out agents)

Before any SendMessage, verify the `to:` value:

- Matches regex `/^[a-z][a-z0-9-]{2,30}$/` (kebab-case, 3-31 chars)
- Validate using TWO-STAGE matching:
  1. **Exact match first:** check if `to:` matches one of: `researcher`, `architect`, `developer`, `reviewer`, `gitops`, `orchestrator`, `analyst`, `debugger`, `optimizer`, `devops`, `tech-writer`. If yes → PASS.
  2. **Suffix strip only if no exact match:** strip trailing `-<digit>+` OR `-<word>` from the END of the name and re-check against whitelist. Apply ONE strip pass only (never recursive).
  - Test cases (must all PASS):
    - `tech-writer` → exact match → PASS
    - `tech-writer-1` → no exact match → strip `-1` → `tech-writer` → PASS
    - `researcher-1` → no exact match → strip `-1` → `researcher` → PASS
    - `analyst-backend` → no exact match → strip `-backend` → `analyst` → PASS
    - `architect-synth` → no exact match → strip `-synth` → `architect` → PASS
  - Test cases (must FAIL):
    - `evil-developer` → no exact match → strip `-developer` → `evil` → not in whitelist → FAIL
    - `developer-evil-extra` → no exact match → strip `-extra` → `developer-evil` → not in whitelist → FAIL
- If validation fails → return result to orchestrator with error metadata. NEVER attempt SendMessage with unvalidated input.

Note: "orchestrator" is a reserved peer always reachable for escalation, even
when not in your peer list. It is NOT spawnable as an agent.

### Why two stages (not one regex)

A single regex cannot distinguish a legitimate fan-out replica name
(`researcher-1`, `analyst-backend`) from a spoofed lookalike
(`evil-developer`). The exact-match-first stage anchors on real agent names; the
single suffix-strip stage admits replica/variant suffixes without ever admitting
a prefix-injected impostor. Stripping is applied exactly ONCE — never
recursively — so `developer-evil-extra` cannot be peeled down to `developer`.

---

## 2. worktreePath Validation (gitops + reviewer only)

When a `worktreePath` is received from another agent (typically developer),
verify ALL of the following BEFORE acting on it:

- Path is absolute and under repo root (e.g., starts with `/home/komluk/repos/<repo-name>/.scaffolding/worktrees/` or `<repo-root>/.worktrees/`)
- Contains NO `..` segments (`path.includes('..')` → reject)
- Path is NOT a symlink (`test -L <path>` MUST return false). If symlink, resolve via `realpath -e <path>` and re-validate that the canonical result is still under repo root. Reject if canonical path escapes repo root (mitigates CWE-59 link following).
- Path exists on disk (`test -d <path>`)
- Path is a registered git worktree — use exact match, NOT substring: `git worktree list --porcelain | awk -v p="<path>" '$1=="worktree" && $2==p {found=1} END {exit !found}'`. NEVER use plain `grep <path>` (substring match allows `/foo/bar` to match `/foo/bar-evil`).
- If ANY check fails → SendMessage to orchestrator with `error: "invalid worktree path"` + the offending value. NEVER cd into or operate on unvalidated paths.

### Why each check matters

| Check | Threat mitigated |
|-------|------------------|
| Absolute + under repo root | Prevents acting on paths outside the project sandbox |
| No `..` segments | Blocks path-traversal escape (`/repo/../etc`) |
| Not a symlink / canonicalize | CWE-59 link following — a symlink could point outside the repo even when the literal path looks safe |
| Exists on disk | Avoids operating on a fabricated path |
| Registered worktree, exact match | Confirms git itself tracks this worktree; substring match would let `/foo/bar-evil` impersonate `/foo/bar` |

---

## Quick Reference

| Situation | Action |
|-----------|--------|
| Any SendMessage | Run recipient validation §1 first |
| Recipient fails validation | Escalate to orchestrator, do NOT send |
| Received a worktreePath (gitops/reviewer) | Run worktreePath validation §2 before any `cd`/git op |
| worktreePath fails any check | SendMessage orchestrator `error: "invalid worktree path"` + value |
