---
name: "Specs: New"
description: Start a new change using the experimental artifact workflow
category: Workflow
tags: [workflow, artifacts, experimental]
---

Start a new change using the experimental artifact-driven approach.

**Input**: The argument after `/specs:new` is a description of what the user wants to build.

## UUID Enforcement

**CRITICAL**: The `conversation_id` MUST be a UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use descriptive names, slugs, or human-readable strings as the conversation_id. If no UUID is available in the prompt context, generate one with `uuidgen` or `node -p 'require("crypto").randomUUID()'`.

**Steps**

1. **If no input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the specs directory**

   Obtain the conversation_id UUID (from prompt context or generate one). Verify it matches UUID format (8-4-4-4-12 hex characters) before proceeding.

   Create the specs directory for this conversation:
   ```bash
   mkdir -p .scaffolding/conversations/{conversation_id}/specs/
   ```
   Where `{conversation_id}` is the UUID. NEVER substitute a descriptive name here.

3. **Show the artifact structure**

   Display the 3-file structure that will be created:
   ```
   .scaffolding/conversations/{conversation_id}/specs/
   ├── proposal.md    <- Why we're doing this (to be created)
   ├── design.md      <- How we'll build it (to be created)
   └── tasks.md       <- Implementation checklist (to be created)
   ```

4. **STOP and wait for user direction**

**Output**

After completing the steps, summarize:
- Specs directory location
- The 3-file artifact structure (proposal.md, design.md, tasks.md)
- Current status (0/3 artifacts created)
- Prompt: "Ready to create the first artifact? Run `/specs:continue` or just describe what this change is about and I'll draft the proposal."

**Guardrails**
- Do NOT create any artifacts yet - just show the structure
- Do NOT advance beyond showing the artifact template
- If a specs directory already exists for this conversation, suggest using `/specs:continue` instead
- The conversation_id MUST be a UUID -- reject or regenerate if it looks like a descriptive name