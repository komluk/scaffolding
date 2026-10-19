---
name: "Specs: Onboard"
description: Guided onboarding - walk through a complete OpenSpec workflow cycle with narration
category: Workflow
tags: [workflow, onboarding, tutorial, learning]
---

Guide the user through their first complete OpenSpec workflow cycle. This is a teaching experience--you'll do real work in their codebase while explaining each step.

## UUID Enforcement

**CRITICAL**: All conversation_id values used in this onboarding MUST be UUIDs (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). Generate one with `uuidgen` if needed. NEVER use descriptive names like `onboard-demo` or `first-task`.

---

## Preflight

Before starting, check if the conversations directory structure exists:

```bash
ls -d .scaffolding/conversations/ 2>/dev/null || echo "NOT_INITIALIZED"
```

**If not initialized:**
> The conversations directory isn't set up yet. Let me create it.

Create `.scaffolding/conversations/` if it doesn't exist.

---

## Phase 1: Welcome

Display:

```
## Welcome to OpenSpec!

I'll walk you through a complete change cycle--from idea to implementation--using a real task in your codebase. Along the way, you'll learn the workflow by doing it.

**What we'll do:**
1. Pick a small, real task in your codebase
2. Explore the problem briefly
3. Create a specs directory (the container for our work)
4. Build the artifacts: proposal -> design -> tasks
5. Implement the tasks
6. Archive the completed change

**Time:** ~15-20 minutes

Let's start by finding something to work on.
```

---

## Phase 2: Task Selection

### Codebase Analysis

Scan the codebase for small improvement opportunities. Look for:

1. **TODO/FIXME comments** - Search for `TODO`, `FIXME`, `HACK`, `XXX` in code files
2. **Missing error handling** - `catch` blocks that swallow errors, risky operations without try-catch
3. **Functions without tests** - Cross-reference `src/` with test directories
4. **Type issues** - `any` types in TypeScript files (`: any`, `as any`)
5. **Debug artifacts** - `console.log`, `console.debug`, `debugger` statements in non-debug code
6. **Missing validation** - User input handlers without validation

Also check recent git activity:
```bash
git log --oneline -10 2>/dev/null || echo "No git history"
```

### Present Suggestions

From your analysis, present 3-4 specific suggestions:

```
## Task Suggestions

Based on scanning your codebase, here are some good starter tasks:

**1. [Most promising task]**
   Location: `src/path/to/file.ts:42`
   Scope: ~1-2 files, ~20-30 lines
   Why it's good: [brief reason]

**2. [Second task]**
   Location: `src/another/file.ts`
   Scope: ~1 file, ~15 lines
   Why it's good: [brief reason]

**3. [Third task]**
   Location: [location]
   Scope: [estimate]
   Why it's good: [brief reason]

**4. Something else?**
   Tell me what you'd like to work on.

Which task interests you? (Pick a number or describe your own)
```

**If nothing found:** Fall back to asking what the user wants to build:
> I didn't find obvious quick wins in your codebase. What's something small you've been meaning to add or fix?

### Scope Guardrail

If the user picks or describes something too large (major feature, multi-day work):

```
That's a valuable task, but it's probably larger than ideal for your first OpenSpec run-through.

For learning the workflow, smaller is better--it lets you see the full cycle without getting stuck in implementation details.

**Options:**
1. **Slice it smaller** - What's the smallest useful piece of [their task]? Maybe just [specific slice]?
2. **Pick something else** - One of the other suggestions, or a different small task?
3. **Do it anyway** - If you really want to tackle this, we can. Just know it'll take longer.

What would you prefer?
```

Let the user override if they insist--this is a soft guardrail.

---

## Phase 3: Explore Demo

Once a task is selected, briefly demonstrate explore mode:

```
Before we create a change, let me quickly show you **explore mode**--it's how you think through problems before committing to a direction.
```

Spend 1-2 minutes investigating the relevant code:
- Read the file(s) involved
- Draw a quick ASCII diagram if it helps
- Note any considerations

```
## Quick Exploration

[Your brief analysis--what you found, any considerations]

+------------------------------------------+
|   [Optional: ASCII diagram if helpful]   |
+------------------------------------------+

Explore mode (`/specs:explore`) is for this kind of thinking--investigating before implementing. You can use it anytime you need to think through a problem.

Now let's create a specs directory to hold our work.
```

**PAUSE** - Wait for user acknowledgment before proceeding.

---

## Phase 4: Create the Specs Directory

**EXPLAIN:**
```
## Creating a Specs Directory

In this workflow, specs live in the conversation directory: `.scaffolding/conversations/{conversation_id}/specs/`. The conversation_id is always a UUID -- a unique identifier for this conversation.

Let me create one for our task.
```

**DO:** Generate a UUID and create the specs directory:
```bash
# Generate UUID for this conversation
CONV_ID=$(uuidgen || python3 -c "import uuid; print(uuid.uuid4())")
mkdir -p .scaffolding/conversations/$CONV_ID/specs/
```

**SHOW:**
```
Created: `.scaffolding/conversations/{conversation_id}/specs/`

The folder structure:
```
.scaffolding/conversations/{conversation_id}/specs/
├── proposal.md    <- Why we're doing this (to be created)
├── design.md      <- How we'll build it (to be created)
└── tasks.md       <- Implementation checklist (to be created)
```

Now let's fill in the first artifact--the proposal.
```

---

## Phase 5: Proposal

**EXPLAIN:**
```
## The Proposal

The proposal captures **why** we're making this change and **what** it involves at a high level. It's the "elevator pitch" for the work.

I'll draft one based on our task.
```

**DO:** Draft the proposal content using the template at `.scaffolding/openspec/schemas/scaffolding-workflow/templates/proposal.md` as the starting structure. Fill in each section with details from the selected task.

Show the draft and ask:

```
Does this capture the intent? I can adjust before we save it.
```

**PAUSE** - Wait for user approval/feedback.

After approval, save to `.scaffolding/conversations/{conversation_id}/specs/proposal.md`.

```
Proposal saved. This is your "why" document--you can always come back and refine it as understanding evolves.

Next up: design.
```

---

## Phase 6: Design

**EXPLAIN:**
```
## Design

The design captures **how** we'll build it--scenarios (Given/When/Then), technical decisions, tradeoffs, approach. Everything goes in one file: design.md.

For small changes, this might be brief. That's fine--not every change needs deep design discussion.
```

**DO:** Draft design.md using the template at `.scaffolding/openspec/schemas/scaffolding-workflow/templates/design.md` as the starting structure. Fill in Context, Specifications (with GIVEN/WHEN/THEN scenarios), Goals/Non-Goals, Decisions, and Risks based on the selected task.

For a small task, sections can be brief -- not every change needs deep design discussion.

Save to `.scaffolding/conversations/{conversation_id}/specs/design.md`.

---

## Phase 7: Tasks

**EXPLAIN:**
```
## Tasks

Finally, we break the work into implementation tasks--checkboxes that drive the apply phase.

These should be small, clear, and in logical order.
```

**DO:** Generate tasks using the format from `.scaffolding/openspec/schemas/scaffolding-workflow/templates/tasks.md`. Group related tasks under numbered headings with `- [ ]` checkboxes. Include a validation step in each group.

Show the tasks and ask: "Each checkbox becomes a unit of work in the apply phase. Ready to implement?"

**PAUSE** - Wait for user to confirm they're ready to implement.

Save to `.scaffolding/conversations/{conversation_id}/specs/tasks.md`.

---

## Phase 8: Apply (Implementation)

**EXPLAIN:**
```
## Implementation

Now we implement each task, checking them off as we go. I'll announce each one and occasionally note how the design informed the approach.
```

**DO:** For each task:

1. Announce: "Working on task N: [description]"
2. Implement the change in the codebase
3. Reference design naturally: "The design says X, so I'm doing Y"
4. Mark complete in tasks.md: `- [ ]` -> `- [x]`
5. Brief status: "Task N complete"

Keep narration light--don't over-explain every line of code.

After all tasks:

```
## Implementation Complete

All tasks done:
- [x] Task 1
- [x] Task 2
- [x] ...

The change is implemented! One more step--let's archive it.
```

---

## Phase 9: Archive

**EXPLAIN:**
```
## Archiving

When a change is complete, we archive it by updating the conversation's context.json status to "archived". The specs remain in place as a decision record--you can always find them later to understand why something was built a certain way.
```

**DO:**
Update the conversation's `context.json` to set `openspec.status` to `"archived"` (read the file, merge, write it back; keep all other keys).

**SHOW:**
```
Archived: status set to "archived" in context.json

The specs remain at `.scaffolding/conversations/{conversation_id}/specs/` as a permanent decision record. The code is in your codebase, the decision record is preserved.
```

---

## Phase 10: Recap & Next Steps

```
## Congratulations!

You just completed a full OpenSpec cycle:

1. **Explore** - Thought through the problem
2. **New** - Created a specs directory
3. **Proposal** - Captured WHY
4. **Design** - Defined WHAT and HOW (scenarios, decisions, risks)
5. **Tasks** - Broke it into steps
6. **Apply** - Implemented the work
7. **Archive** - Preserved the record

This same rhythm works for any size change--a small fix or a major feature.

---

## Command Reference

| Command | What it does |
|---------|--------------|
| `/specs:explore` | Think through problems before/during work |
| `/specs:new` | Start a new change, step through artifacts |
| `/specs:ff` | Fast-forward: create all artifacts at once |
| `/specs:continue` | Continue working on an existing change |
| `/specs:apply` | Implement tasks from specs |
| `/specs:verify` | Verify implementation matches artifacts |
| `/specs:archive` | Archive a completed change |

---

## What's Next?

Try `/specs:new` or `/specs:ff` on something you actually want to build. You've got the rhythm now!
```

---

## Graceful Exit Handling

### User wants to stop mid-way

If the user says they need to stop, want to pause, or seem disengaged:

```
No problem! Your specs are saved at `.scaffolding/conversations/{conversation_id}/specs/`.

To pick up where we left off later:
- `/specs:continue` - Resume artifact creation
- `/specs:apply` - Jump to implementation (if tasks exist)

The work won't be lost. Come back whenever you're ready.
```

Exit gracefully without pressure.

### User just wants command reference

If the user says they just want to see the commands or skip the tutorial, show the Command Reference table from Phase 10 above and suggest `/specs:new` or `/specs:ff` to get started. Exit gracefully.

---

## Guardrails

- **Follow the EXPLAIN -> DO -> SHOW -> PAUSE pattern** at key transitions (after explore, after proposal draft, after tasks, after archive)
- **Keep narration light** during implementation--teach without lecturing
- **Don't skip phases** even if the change is small--the goal is teaching the workflow
- **Pause for acknowledgment** at marked points, but don't over-pause
- **Handle exits gracefully**--never pressure the user to continue
- **Use real codebase tasks**--don't simulate or use fake examples
- **Adjust scope gently**--guide toward smaller tasks but respect user choice
- **conversation_id MUST be a UUID**--never use descriptive names for conversation directories