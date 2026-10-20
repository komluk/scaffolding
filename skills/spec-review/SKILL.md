---
name: spec-review
description: "Verify an implementation against its OpenSpec artifacts. TRIGGER when: checking completed work against design.md and tasks.md. SKIP: security-specific review (use security-review-checklists); executing tasks (use spec-develop)."
---

# OpenSpec Verification

Guide for verifying that implementation matches spec artifacts.

## Input Files

| File | Required | Purpose |
|------|----------|---------|
| `{specs_path}/design.md` | Yes | Requirements and scenarios to verify |
| `{specs_path}/tasks.md` | Yes | Completion checklist |
| `{specs_path}/proposal.md` | Optional | Original intent reference |

**Path Enforcement**: The `specs_path` MUST be `.scaffolding/conversations/{UUID}/specs/` where `{UUID}` is a valid UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use descriptive folder names.

`.scaffolding/conversations/` is a symlink to `<share>/projects/<repo-name>/conversations` (paths below are unchanged; always go through the symlink).

## Three Verification Dimensions

### 1. Completeness

**Question**: Are all tasks done and all requirements covered?

| Check | Method | Issue Level |
|-------|--------|-------------|
| All checkboxes marked `[x]` | Parse tasks.md | CRITICAL if incomplete |
| All requirements have code | Search codebase for keywords | CRITICAL if missing |
| All new files exist | Verify file paths from tasks | CRITICAL if missing |

### 2. Correctness

**Question**: Does the code do what the spec says?

| Check | Method | Issue Level |
|-------|--------|-------------|
| GIVEN/WHEN/THEN satisfied | Trace scenario through code | WARNING if divergent |
| Tests cover scenarios | Match test names to scenarios | WARNING if uncovered |
| Edge cases handled | Check error paths in code | WARNING if missing |
| Validation commands pass | Run pytest / npm run validate | CRITICAL if failing |

### 3. Coherence

**Question**: Does the code match design decisions?

| Check | Method | Issue Level |
|-------|--------|-------------|
| Design decisions followed | Compare Decisions section to code | WARNING if violated |
| Patterns consistent | Check naming, structure, style | SUGGESTION |
| No undocumented changes | Diff scope vs design scope | WARNING if extra |
| No design deviations | Cross-reference architecture | WARNING if different |

## Two-Stage Review

Review in two ordered stages. Do not start stage 2 until stage 1 passes.

| Stage | Question | Basis | Blocks on |
|-------|----------|-------|-----------|
| 1. Spec compliance | Does it build exactly what was asked - nothing missing, nothing extra? | design.md requirements/scenarios, tasks.md | Missing or divergent requirement, undocumented scope |
| 2. Code quality | Is it well built - readable, tested, secure, maintainable? | Project conventions, tests, patterns | Bugs, missing tests, unsafe code; style nits are SUGGESTION |

Why this order: polishing code that implements the wrong thing is wasted work,
and quality findings on code that will change after a spec fix are noise. Stage 1
maps to the Completeness + Correctness + Coherence dimensions above; stage 2 is
the code-quality pass layered on top. Report stage results separately.

## Receiving Code Review (implementer side)

When acting on review feedback:
1. **Read all items first**, then address them in order: CRITICAL, WARNING, SUGGESTION.
2. **Verify before changing** - confirm each finding against the code; do not apply a suggestion blindly.
3. **Disagree with evidence** - if a finding is wrong or conflicts with the spec, reply with the reason (file/line, spec reference) instead of silently ignoring or complying.
4. **One fix, one check** - after each change re-run the relevant tests; do not batch unrelated fixes.
5. **Ask when unclear** - an ambiguous item gets a question, not a guess.
6. **Report back** per item: fixed / disputed (why) / deferred (why). No performative agreement; state what changed.

## Verification Process

1. **Load artifacts** - Read design.md, tasks.md, proposal.md
2. **Check completeness** - Parse checkboxes, search for requirement implementations
3. **Check correctness** - Trace each scenario through code, verify test coverage
4. **Check coherence** - Compare decisions to implementation, check patterns
5. **Generate report** - Summarize findings with issue levels

## Report Format

```markdown
## Verification Report

### Summary
| Dimension    | Status              |
|--------------|---------------------|
| Completeness | X/Y tasks, N reqs   |
| Correctness  | M/N scenarios pass   |
| Coherence    | Followed / N issues  |

### Critical Issues
| # | Dimension | Issue | File | Recommendation |
|---|-----------|-------|------|----------------|
| 1 | Completeness | Task 2.3 incomplete | - | Complete or mark blocked |

### Warnings
| # | Dimension | Issue | File | Recommendation |
|---|-----------|-------|------|----------------|
| 1 | Correctness | Scenario X not tested | test_foo.py | Add test case |

### Suggestions
- [Pattern deviation details with file reference]

### Assessment
[CRITICAL: N issues | WARNINGS: N | Ready for archive: Yes/No]
```

## Graceful Degradation

| Available Artifacts | Checks Performed |
|--------------------|-----------------|
| tasks.md only | Completeness (checkboxes) only |
| tasks.md + design.md | Completeness + Correctness |
| All three | All three dimensions |

Always note which checks were skipped and why.

## Verification Heuristics

- **Completeness**: Focus on objective items (checkboxes, requirement lists)
- **Correctness**: Use keyword search + file path analysis; don't require certainty
- **Coherence**: Look for glaring inconsistencies, don't nitpick style
- **False positives**: Prefer SUGGESTION over WARNING, WARNING over CRITICAL when uncertain
- **Actionability**: Every issue must have a specific recommendation with file references