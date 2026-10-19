---
name: "Specs: Bulk Archive"
description: Archive multiple completed changes at once
category: Workflow
tags: [workflow, archive, experimental, bulk]
---

Archive multiple completed changes in a single operation.

This skill allows you to batch-archive conversations, handling conflicts intelligently by checking the codebase to determine what's actually implemented.

**Input**: None required (prompts for selection)

**UUID Enforcement**: All conversation_ids MUST be UUIDs (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). When listing conversations, only include directories with valid UUID names. Non-UUID directory names are invalid and should be flagged as misplaced.

**Steps**

1. **Get active conversations with specs**

   List conversations that have specs directories under `.scaffolding/conversations/*/specs/`.
   Filter to only those where:
   - The directory name is a valid UUID (8-4-4-4-12 hex pattern)
   - `context.json` does NOT have `openspec.status: "archived"`

   If non-UUID directories are found, warn: "Found N conversation directories with non-UUID names (these are invalid and should be cleaned up)."

   If no active conversations exist, inform user and stop.

2. **Prompt for conversation selection**

   Use **AskUserQuestion tool** with multi-select to let user choose conversations:
   - Show each conversation with its artifact status
   - Include an option for "All conversations"
   - Allow any number of selections (1+ works, 2+ is the typical use case)

   **IMPORTANT**: Do NOT auto-select. Always let the user choose.

3. **Batch validation - gather status for all selected conversations**

   For each selected conversation, collect:

   a. **Artifact status** - Check which of proposal.md, design.md, tasks.md exist

   b. **Task completion** - Read `tasks.md`
      - Count `- [ ]` (incomplete) vs `- [x]` (complete)
      - If no tasks file exists, note as "No tasks"

4. **Show consolidated status table**

   Display a table summarizing all conversations:

   ```
   | Conversation         | Artifacts | Tasks | Status |
   |---------------------|-----------|-------|--------|
   | abc-123             | 3/3       | 5/5   | Ready  |
   | def-456             | 3/3       | 3/3   | Ready  |
   | ghi-789             | 2/3       | 2/5   | Warn   |
   ```

   For incomplete conversations, show warnings:
   ```
   Warnings:
   - ghi-789: 1 missing artifact, 3 incomplete tasks
   ```

5. **Confirm batch operation**

   Use **AskUserQuestion tool** with a single confirmation:

   - "Archive N conversations?" with options based on status
   - Options might include:
     - "Archive all N conversations"
     - "Archive only N ready conversations (skip incomplete)"
     - "Cancel"

   If there are incomplete conversations, make clear they'll be archived with warnings.

6. **Execute archive for each confirmed conversation**

   For each conversation:

   a. **Update context.json** to set `openspec.status` to `"archived"` (read-merge-write: preserve every other key)

   b. **Track outcome**:
      - Success: archived successfully
      - Failed: error during archive (record error)
      - Skipped: user chose not to archive (if applicable)

7. **Display summary**

   Show final results:

   ```
   ## Bulk Archive Complete

   Archived 3 conversations:
   - abc-123: status set to "archived"
   - def-456: status set to "archived"
   - ghi-789: status set to "archived"
   ```

   If any skipped:
   ```
   Skipped 1 conversation:
   - ghi-789 (user chose not to archive incomplete)
   ```

**Output When No Conversations**

```
## No Conversations to Archive

No active conversations with specs found. Use `/specs:new` to create a new change.
```

**Guardrails**
- Allow any number of conversations (1+ is fine, 2+ is the typical use case)
- Always prompt for selection, never auto-select
- Show clear per-conversation status before confirming
- Use single confirmation for entire batch
- Track and report all outcomes (success/skip/fail)
- Archive = status flag update in context.json, not file move
- Only list UUID-named directories as valid conversations