---
name: necessity-first
description: "Necessity (YAGNI) gate before writing code: delete, reuse, stdlib, one-liner, then minimum. TRIGGER when: about to add code, a feature, a dependency or an abstraction. SKIP: sequencing a plan (planning-methodology); scoring a plan (quality-validation); checking finished work (verification-before-completion)."
---

# Necessity First

## Purpose

The cheapest code is code that never gets written. This skill is a gate that runs
**after** you understand the problem and **before** you implement: climb a short
ladder and stop at the first rung that solves it. The goal is the smallest change
that actually works, not the most impressive one.

Be lazy about the **solution**, never negligent about **correctness or safety**.
Hardening, extra layers and "best practice" beyond what the task needs are an
*option to offer*, not a default to impose.

## When to Apply

TRIGGER when:

- About to write new code, a new file, a new module, or a new abstraction
- About to add a dependency, config option, flag, or extension point
- A request sounds bigger than the problem it describes

SKIP (use the named skill instead):

- Ordering the steps of a plan once the approach is chosen — `planning-methodology`
- Scoring a ResearchPack or plan against quality gates — `quality-validation`
- Proving finished work is done by executing it — `verification-before-completion`
- Writing OpenSpec design.md / tasks.md — `spec-design`
- Matching the existing code style once you do write code — `pattern-recognition`

Boundary in one line: this skill decides **whether and how little** to build;
the others plan it, score it, style it, or verify it.

## Step 0: Understand First

The ladder is only valid on top of understanding. Before climbing it, read the
code you would touch and trace the real flow (caller, data, failure path). Without
that, "it already exists" and "one line is enough" are guesses.

## The Ladder

Climb in order. Stop at the first rung that works.

| # | Rung | Question | If yes |
|---|------|----------|--------|
| 1 | Existence | Does this need to exist at all? Is the requirement real, or can we delete or not build it? | Do nothing, or delete. Say so. |
| 2 | Reuse | Is it already in this codebase? | Call or extend what exists. |
| 3 | Platform | Does the stdlib, the platform, or a dependency we already have do it? | Use that. No new dependency for a solved problem. |
| 4 | Trivial | Can it be one line or a trivial edit? | Make that edit. |
| 5 | Minimum | Only now: what is the least code that works? | Write that, plus a small test where the logic branches, loops, parses, handles money, or touches security. |

Rules of thumb:

- No speculative generality: no interface with one implementation, no option
  nobody asked for, no "we might need it later".
- Three similar lines beat a premature helper.
- Rung 5 still gets a test when it has branches, loops, parsers, money, or
  security. One-liners with no logic do not need one.

## Non-Negotiable Carve-Out

Never cut these in the name of minimalism. They are part of "works", not extras:

| Always keep | Examples |
|-------------|----------|
| Trust-boundary / input validation | User input, API payloads, file uploads, env/config from outside |
| Data-loss handling | Transactions, atomic writes, confirmation before destructive ops, backups |
| Security | Authn/authz, secrets handling, injection and traversal defenses |
| Accessibility | Labels, keyboard access, contrast, semantic markup |

Minimal means no *unnecessary* code. Safe-by-necessity code is necessary.

## Closing Note (every implementation)

End each implementation with a short, honest note:

```markdown
**Skipped / deferred / risks**
- Skipped: [what you deliberately did not build, and why]
- Deferred: [what could be added later if it becomes real]
- Risks: [what the user should know — limits, assumptions, untested paths]
```

Keep it to a few lines. "Nothing skipped" is a valid answer when true.

## Anti-Patterns

| Mistake | Correction |
|---------|------------|
| Starting at rung 5 | Walk rungs 1-4 first; write down why each failed |
| Climbing without reading the code | Do Step 0; trace the real flow |
| Skipping validation or auth "to keep it small" | Carve-out is mandatory |
| Adding a dependency for a stdlib one-liner | Rung 3 |
| Building the configurable/extensible version unasked | Offer it as an option in the closing note |
| Treating the ladder as a reason to refuse work | It picks the smallest *working* change, it does not block the task |
| Silent omissions | Always list skipped/deferred/risks |

## Quality Checklist

- [ ] Read the touched code and traced the real flow before deciding
- [ ] Rungs 1-4 each considered, stopped at the first that works
- [ ] No unrequested abstraction, option, or dependency
- [ ] Carve-out items (validation, data loss, security, a11y) intact
- [ ] Small test added where logic branches/loops/parses or handles money/security
- [ ] Closing "Skipped / deferred / risks" note included
