# /learn Command

Distill a finished conversation into classified knowledge candidates and propose
(never auto-apply) memory writes or a new-skill hand-off. Closes the loop between
a completed agent chain and the persistent memory system.

## Usage

```
/learn [conversation_id]
```

`conversation_id` is optional — when omitted, the active conversation is used. It
MUST be a UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

## What It Does

1. Resolves the `conversation_id`
2. Locates `context.md` and the design `## Decisions` section
3. Exits cleanly if there is nothing to distill
4. Distills the conversation into knowledge candidates
5. Classifies each candidate: memory entry vs new-skill proposal
6. Dry-run proposes the changes; applies only on explicit confirmation

Apply the `distill` skill (Conversation-Scoped Distillation + Skill Promotion
Criterion) and the `agent-memory` skill (Learning Loop) throughout.

## Steps

Follow these steps exactly.

### 1. Resolve the conversation_id

```bash
CONV_ID="$1"

if [ -z "$CONV_ID" ]; then
  # Default: most recently modified conversation directory.
  CONV_ID=$(ls -1dt .scaffolding/conversations/*/ 2>/dev/null | head -1 | xargs -r basename)
fi

UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
if ! echo "$CONV_ID" | grep -qE "$UUID_RE"; then
  echo "ABORT: '$CONV_ID' is not a valid conversation UUID."
  exit 1
fi

echo "Conversation: $CONV_ID"
```

### 2. Locate the input files

```bash
CONV_DIR=".scaffolding/conversations/$CONV_ID"
CONTEXT_FILE="$CONV_DIR/agent-memory/context.md"
DESIGN_FILE="$CONV_DIR/specs/design.md"

if [ ! -f "$CONTEXT_FILE" ]; then
  echo "Nothing to distill: $CONTEXT_FILE does not exist."
  echo "The /learn command exits cleanly — no conversation memory to process."
  exit 0
fi

echo "Found context: $CONTEXT_FILE"
if [ -f "$DESIGN_FILE" ]; then
  echo "Found design:  $DESIGN_FILE"
else
  echo "No design.md — distilling from context.md only."
fi
```

The absence of `context.md` is the explicit "nothing to distill" clean-exit
branch — it is a success, not an error.

### 3. Distill the conversation

Read `context.md` and, if present, the `## Decisions` section of `design.md`.
Apply the `distill` skill's **Conversation-Scoped Distillation** mode:

- Use the Knowledge Candidate Criteria — for a single conversation, rely on the
  Decision-section and pattern-keyword criteria (the cross-conversation criterion
  does not apply).
- Score each candidate with the Confidence Scoring table.

If no candidate clears the bar, report "nothing to distill" and exit cleanly.

### 4. Classify each candidate

For every candidate, apply `distill`'s **Skill Promotion Criterion**:

- **Memory entry** — a situational insight, gotcha, or one-off decision. Route to
  a tier per the `agent-memory` Learning Loop: `shared`, `agent:{name}`, or the
  conversation tier.
- **New skill** — a repeatable procedure or methodology. Do not write memory;
  instead draft a `/create-skill` proposal.

### 5. Dry-run propose

By default `/learn` writes nothing. Print:

- For each memory candidate: the target file, the proposed appended bullet(s),
  and the resulting line count (flag if `KNOWLEDGE.md` would exceed 200 lines).
- For each skill candidate: a pre-filled `/create-skill` draft (name, purpose,
  2–4 triggers, SKIP neighbours).

Then ask the user to confirm before applying anything.

### 6. Apply on confirmation

Only after explicit confirmation:

```bash
echo "Applying confirmed candidates..."
```

- Append memory entries to their target files. If a `KNOWLEDGE.md` write would
  exceed 200 lines, overflow lower-confidence entries to the most relevant agent
  `MEMORY.md` per the `distill` overflow rule.
- Keep each individual file edit under 200 lines — split larger writes.
- For skill candidates, instruct the user to run the proposed `/create-skill`
  invocation; `/learn` does not create skills itself.

### 7. Report

Print a summary: candidates found, memory entries applied (per tier), and skill
proposals handed off. Note that applied memory becomes auto-injected context on
the next task.

## Notes

- `/learn` is propose-then-confirm — it never silently pollutes auto-injected
  `KNOWLEDGE.md`.
- It is backend-free: it reads only `.scaffolding/conversations/{id}/` markdown,
  with no session-log mining and no database.
- Running `/learn` on a conversation with no `context.md` is safe and exits 0.
