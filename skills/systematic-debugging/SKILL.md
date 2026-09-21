---
name: systematic-debugging
description: "Phase-based root cause investigation: reproduce, observe, hypothesize, bisect, verify. TRIGGER when: investigating a bug report, diagnosing unexpected behavior, or doing root cause analysis. SKIP: looking up a known error first (use sofa-search); writing the regression test (use testing-strategy); live-repro watcher (use watch-patterns)."
---

# Systematic Debugging Skill

## Purpose

A repeatable root cause investigation procedure. A bug is not understood until
it can be reproduced on demand and the causal chain is traced back to a fixable
defect. This skill encodes the phase order and the discipline (one variable at a
time, bisect instead of scan, verify by reverting) that keeps an investigation
from turning into guesswork.

## When to Apply

Apply this skill when:

- Investigating a reported bug or unexpected behavior
- Diagnosing a failing test, crash, or incorrect output
- Performing root cause analysis before recommending a fix
- An error message, stack trace, or log output needs to be traced to its origin

Do NOT apply this skill for:

- Writing the regression test that prevents recurrence — use `testing-strategy`
- Constructing the poll/watch loop used to observe a live reproduction — use `watch-patterns`
- Looking up a known/unfamiliar error before investigating from scratch — use `sofa-search`

---

## Investigation Phases

Work the phases in order. Do not skip ahead to a fix before phase 6.

| Phase | Action | Exit Criterion |
|-------|--------|-----------------|
| 1. Reproduce first | Establish a minimal, reliable repro before forming any hypothesis | Bug reproduces on demand, deterministically |
| 2. Observe before theorizing | Read the actual error text, stack trace, and logs verbatim | Symptom described using only observed evidence, zero assumptions |
| 3. Hypothesize | State one falsifiable hypothesis and the prediction that would confirm or refute it | Hypothesis has a concrete, testable prediction |
| 4. Test one variable | Change exactly one thing, run the test, compare to the prediction | Prediction confirmed or refuted; refuted hypotheses are discarded, not recycled |
| 5. Bisect the search space | Narrow via git bisect, binary search on input, or disabling half the config — not linear code reading | Candidate range halves each round |
| 6. Trace backward | Walk the call stack from the crash site back to the original trigger | Triggering call/input identified, not just the frame that crashed |
| 7. Root cause, not proximate cause | Keep asking "why" until the chain reaches something you can actually fix | Chain terminates at a fixable defect (bad state, wrong assumption, missing check) |
| 8. Verify by reverting | Revert the fix and confirm the symptom returns; reapply and confirm it clears | Causation proven in both directions |

### Bisection Techniques by Search Space

| Search space | Technique |
|--------------|-----------|
| Regression across commits | `git bisect` between known-good and known-bad revisions |
| Large/complex input triggers failure | Binary search: halve the input, check which half still fails |
| Behavior depends on config/flags | Disable half the flags/config, narrow to the culprit |
| Unclear which layer owns the bug | Bisect the call stack: instrument the midpoint, check state there |

### Hypothesis Discipline

| Rule | Why |
|------|-----|
| One hypothesis at a time | Multiple simultaneous changes make it impossible to attribute the outcome |
| Prediction must be falsifiable | An untestable hypothesis cannot be confirmed or ruled out |
| Never pattern-match a remembered bug onto new symptoms | Confirmation bias skips the actual evidence in phase 2 |
| A refuted hypothesis is discarded, not adjusted and reused | Adjusting mid-test invalidates the prior result |

---

## Anti-Patterns

| Anti-Pattern | Problem | Instead |
|--------------|---------|---------|
| Forming a hypothesis before reproducing | Guessing wastes cycles on an unconfirmed bug | Reproduce deterministically first |
| Pattern-matching to a remembered similar bug | Misses the actual cause, confirmation bias | Read the actual error/stack/logs fresh (phase 2) |
| Changing multiple things per test | Cannot attribute the result to any one change | Change exactly one variable per test |
| Reading code top-to-bottom to find the defect | Slow, linear, scales poorly | Bisect the search space (phase 5) |
| Stopping investigation at the crash site | Fixes the symptom, not the defect | Trace backward to the original trigger (phase 6) |
| Declaring root cause without reverting the fix | Causation asserted, not proven | Revert, confirm symptom returns, reapply (phase 8) |

---

## Quality Checklist

- [ ] Bug reproduces reliably, and reproduction happened before any hypothesis was formed
- [ ] Investigation cites actual error text/stack/logs, not assumptions or memory of a similar bug
- [ ] Each hypothesis had a falsifiable prediction, and only one variable changed per test
- [ ] The search space was bisected, not scanned linearly
- [ ] The causal chain was traced backward from the symptom through the call stack to the trigger
- [ ] The identified cause is a fixable root cause, not a proximate symptom
- [ ] The fix was verified by reverting it and confirming the symptom returns
