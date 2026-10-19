---
name: "Specs: Archive"
description: Archive a completed change in the experimental workflow
category: Workflow
tags: [workflow, archive, experimental]
---

Archive a completed change by updating its status in context.json.

**Input**: Optionally specify a conversation_id after `/specs:archive`. If omitted, use the current conversation's UUID. If vague or ambiguous, list conversations that have specs directories.

**UUID Enforcement**: The conversation_id MUST be a UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use descriptive names.

**Steps**

1. **Locate the specs directory**

   Use the current conversation's UUID or the provided one to find:
   `.scaffolding/conversations/{conversation_id}/specs/`

   If no specs directory exists, inform the user and stop.

2. **Check artifact completion status**

   Check which of the 3 artifacts exist:
   - `proposal.md`
   - `design.md`
   - `tasks.md`

   **If any artifacts are missing:**
   - Display warning listing missing artifacts
   - Prompt user for confirmation to continue
   - Proceed if user confirms

3. **Check task completion status**

   Read `tasks.md` to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Prompt user for confirmation to continue
   - Proceed if user confirms

   **If no tasks.md exists:** Proceed without task-related warning.

4. **Perform the archive**

   Update the conversation's `context.json` to set `openspec.status` to `"archived"`:
   - Read `.scaffolding/conversations/{conversation_id}/context.json` (all fields are optional; create it with just `conversation_id` if missing)
   - Add or update the `openspec` field: `{ "status": "archived" }` (merge into an existing `openspec` object)
   - Write back the whole object (read-merge-write): preserve every other key, e.g. `original_intent`, `task_history`, `status`

   The specs files remain in place as a decision record.

5. **Display summary**

   Show archive completion summary including:
   - Conversation ID
   - Archive status (set to "archived" in context.json)
   - Note about any warnings (missing artifacts/incomplete tasks)

**Output On Success**

```
## Archive Complete

**Conversation:** <conversation_id>
**Status:** archived (updated in context.json)

All artifacts complete. All tasks complete.
The specs remain at `.scaffolding/conversations/{conversation_id}/specs/` as a decision record.
```

**Output On Success With Warnings**

```
## Archive Complete (with warnings)

**Conversation:** <conversation_id>
**Status:** archived (updated in context.json)

**Warnings:**
- Archived with 2 missing artifacts
- Archived with 3 incomplete tasks

Review the specs if this was not intentional.
```

**Guardrails**
- Don't block archive on warnings - just inform and confirm
- The archive operation is a status flag update, not a file move
- Specs remain in place as permanent decision records
- Show clear summary of what happened