---
name: verification-before-completion
description: "Verify claims by executing, not asserting, before declaring work done. TRIGGER when: about to report a task complete, confirming a fix/build/deploy works, or delegating work to another agent or tool. SKIP: scoring research/plan quality pre-implementation (use quality-validation); deciding test coverage strategy (use testing-strategy)."
---

# Verification Before Completion Skill

## Purpose

A claim of "done" is only as good as the check that produced it. This skill
encodes the rule that every completion claim, and every fact a claim depends on,
must be backed by something actually executed and observed — not assumed,
remembered, or guessed — before it is reported.

## When to Apply

Apply this skill when:

- About to report a task, fix, or feature as complete
- Confirming that a build, test, deploy, or query actually succeeded
- Stating a fact about a file, branch, or config that the response depends on
- Delegating a task to another agent or tool

Do NOT apply this skill for:

- Scoring a ResearchPack or Implementation Plan against quality gates before work starts — use `quality-validation`
- Deciding what and how much to test — use `testing-strategy`

---

## Verification Rules

| Rule | Requirement |
|------|-------------|
| Prove before claiming | Run the actual command that demonstrates the outcome (test suite, build, the real query) and read its output. Exit code 0 alone is not proof of correctness — check the output content. |
| Verify against the authoritative source | Confirm facts (file existence, path, branch content, config value) against the actual target (e.g. `main`, prod). A stale checkout, cached artifact, or side branch is not evidence about the target. |
| One failure = investigate | After a failed attempt, diagnose the actual cause before trying again. Do not retry the same action with a blind variation. |
| Two guesses = stop | If a second consecutive guess is about to be made without new evidence, stop. Search the codebase for an existing pattern (grep) instead of guessing again. |
| Check capability before delegating | Confirm the executor (agent or tool) actually has the access/tools the task requires before handing it off. |
| Absence of error is not success | Not seeing an error is not the same as confirming success. Only a positive, observed result counts as verification. |
| State the verification | Report what was verified and how (command run, output observed) so the claim is auditable by someone else. |

### Decision: Guess vs. Investigate vs. Search

| Situation | Action |
|-----------|--------|
| First attempt fails | Read the error, diagnose the actual cause |
| About to try a second unverified variation | Stop — grep the repo/docs for the existing pattern instead |
| Uncertain which transport/config/convention applies | Search for how the codebase already does it before picking one |
| A fact is needed about `main`/production | Re-check it on that actual target, not a local/stale copy |
| Delegating a task | Confirm the recipient's tool/access list covers the task first |

---

## Anti-Patterns

| Anti-Pattern | Problem | Instead |
|--------------|---------|---------|
| Guessing a transport/config repeatedly (e.g. try HTTPS, then try SSH) | Wastes turns on trial-and-error the repo already answers | Grep the repo for the existing pattern already in use |
| Citing a file/path read from a stale checkout or different branch | Claim doesn't hold on the actual target branch | Re-read the fact from the actual target before stating it |
| Delegating to an agent/tool that lacks the needed capability | Failure surfaces only after the delegate returns | Confirm required tools/access before handoff |
| Declaring "done" because no error appeared | Silent failures pass unnoticed | Run a command that positively demonstrates the result and read its output |
| Retrying an identical failed action | Same failure repeats, no progress | Diagnose the cause before the next attempt |

---

## Quality Checklist

- [ ] The command/query that proves completion was actually run, and its output read (not just its exit code)
- [ ] Facts about files/branches/configs were checked against the authoritative target, not a stale or local copy
- [ ] No two consecutive unverified guesses were made — the first failure triggered investigation, not a retry
- [ ] The delegate's toolset/access was confirmed sufficient before handoff
- [ ] The completion claim states what was verified and how (command + observed output)
