---
name: "Specs: Fast Forward"
description: Create a change and generate all artifacts needed for implementation in one go
category: Workflow
tags: [workflow, artifacts, experimental]
---

Fast-forward through artifact creation - generate everything needed to start implementation.

**Input**: The argument after `/specs:ff` is a description of what the user wants to build.

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

3. **Create all 3 artifacts in sequence**

   Create each artifact file in the specs directory:

   a. **proposal.md** - Why and what:
      - Write `proposal.md` with Why, What Changes, Capabilities, Impact, Agent Assignment, Rollback Plan
      - Show brief progress: "Created proposal.md"

   b. **design.md** - How (read proposal.md first):
      - Write `design.md` with scenarios (Given/When/Then), implementation decisions, file changes, risks
      - Show brief progress: "Created design.md"

   c. **tasks.md** - What to do (read proposal.md and design.md first):
      - Write `tasks.md` with checkbox task list for the developer
      - Show brief progress: "Created tasks.md"

   If an artifact requires user input (unclear context):
   - Use **AskUserQuestion tool** to clarify
   - Then continue with creation

4. **Show summary**

**Output**

After completing all artifacts, summarize:
- Specs directory location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/specs:apply` to start implementing."

**Artifact Creation Guidelines**

- Read dependency artifacts for context before creating new ones
- proposal.md informs design.md, both inform tasks.md

**Guardrails**
- Create ALL 3 artifacts (proposal.md, design.md, tasks.md)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If specs already exist for this conversation, ask if user wants to continue or start fresh
- Verify each artifact file exists after writing before proceeding to next
- The conversation_id MUST be a UUID -- reject or regenerate if it looks like a descriptive name