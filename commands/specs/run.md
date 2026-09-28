---
name: "Specs: Run"
description: Execute the workflow.yaml step graph via delegated agents (Experimental)
category: Workflow
tags: [workflow, orchestration, agents, experimental]
---

Execute the `workflows/workflow.yaml` step graph end-to-end via delegated agents: complexity
gate, IMPL/REVIEW issue graph, retry loops, and a final integration review.

**When to use which:** `/specs:run` delegates the full multi-agent graph
(analyst -> researcher -> architect -> developer/reviewer pairs -> tech-writer -> gitops) and
is the only one of the three that runs retry loops and an integration review. `/specs:ff`
generates the three artifacts (`proposal.md`, `design.md`, `tasks.md`) inline in the main
agent with no delegation and no execution. `/specs:apply` implements an *existing*
`tasks.md` checklist inline; it does not run the propose/design/review graph. Use `/specs:run`
when you want the whole pipeline driven for you; use `/specs:ff` + `/specs:apply` when you
want to inspect/edit artifacts between phases.

This is an LLM following markdown instructions that reads `workflow.yaml` as data — not a
real scheduler. See **Limitations**.

**Input**: The argument after `/specs:run` is a description of what to build (minus flags).
Bare `/specs:run <description>` with no flags is the primary form.

- `--conversation <uuid>` (optional) — reuse an existing conversation's specs directory
- `--complexity small|medium|large` (optional) — skip inference; `small` takes the light
  path (developer directly), anything else runs the full pipeline

Flags are stripped from the description before it is used as `{description}`.

## UUID Enforcement

**CRITICAL**: The `conversation_id` MUST be a UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
pattern `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`). NEVER use descriptive
names, slugs, or human-readable strings as the conversation_id. If `--conversation` fails this
pattern, reject it, generate a real UUID with `uuidgen` or
`python3 -c "import uuid; print(uuid.uuid4())"`, and announce the substitution.

**Steps**

1. **Resolve inputs**

   - `description`: if no argument was given, use the **AskUserQuestion tool** (open-ended,
     no preset options) with the same wording as `/specs:new` step 1: "What change do you
     want to work on? Describe what you want to build or fix." Do not proceed without one.
   - `conversation_id`: from `--conversation <uuid>` (validated) or the current conversation's
     UUID; generate one if neither is available.
   - `complexity`: from `--complexity`, else infer from the `CLAUDE.md` decision tree (single
     file + clear scope -> `small`; multi-file / new system / ambiguous -> not small), then
     confirm the inferred value and the branch it implies with the user via
     **AskUserQuestion** before running `propose` or `implement-direct`.
   - If `{specs_path}` already contains a populated `tasks.md`, warn and ask (AskUserQuestion)
     whether to continue in place or start fresh with a new UUID — mirrors `/specs:ff`.

2. **Derive `specs_path` and create it**

   `.scaffolding/conversations/{conversation_id}/specs/` — always with a trailing slash.
   ```bash
   mkdir -p .scaffolding/conversations/{conversation_id}/specs/
   ```

3. **Read the workflow definition**

   Read `workflows/workflow.yaml` as data. This is the only workflow file read — no other
   YAML in the repo is interpreted by this command.

   `settings.timeout_minutes: 120` is a stated **advisory** budget for the whole run — state
   it once in the run header. It is not enforced; there is no scheduler to enforce it.

4. **Evaluate step conditions by table lookup, never by general expression parsing**

   | Condition string | Steps | True when |
   |---|---|---|
   | `inputs.complexity != 'small'` | `propose`, `design`, `implement` | resolved `complexity` is anything other than `small` (including unset) |
   | `inputs.complexity != 'small' and steps.propose.needs_research == True` | `research` | the above AND `proposal.md` contains the literal `**Research Needed**: Yes` field (`agents/analyst.md`'s proposal template); if that field is absent, fall back to the `spec-workflow` skill's "When Researcher Is Needed" prose, defaulting to false and recording the default in the trace |
   | `inputs.complexity == 'small'` | `implement-direct` | resolved `complexity` is exactly `small` |

   Steps with no `condition` (`review`, `document`, `push`) always run. If `workflow.yaml`
   ever contains a condition string outside this table, HALT and report the unrecognised
   expression and step id — never guess.

5. **Substitute placeholders before every `Task` call**

   | Placeholder | Value |
   |---|---|
   | `{description}` | resolved `description`, verbatim |
   | `{conversation_id}` | the validated UUID |
   | `{specs_path}` | `.scaffolding/conversations/{conversation_id}/specs/` — concatenates directly (`{specs_path}proposal.md`); keep the trailing slash |
   | `{original_prompt}` | the user's full original `/specs:run` invocation text, unedited — captured once at run start, reused for every step |
   | `{language_instruction}` | the response-language directive for this session, or empty string when none applies — an empty value renders as nothing, never as the literal placeholder |

   Always additionally pass `conversation_id` and `specs_path` in every delegation per the
   `spec-workflow` skill, even where a template omits them. Never send an unsubstituted
   `{...}` token to an agent.

6. **Execute the step graph in dependency order**

   A dependency is satisfied when its status is `succeeded`, `skipped`, or
   `failed (max_loops exhausted)`; it blocks only while `pending`/`running`. This is
   load-bearing: `review` declares `depends_on: [implement, implement-direct]`, and exactly
   one of those two is always skipped by the complexity gate — a naive "all deps must
   succeed" reading deadlocks every run.

   A plain `failed` status (no `max_loops` involved) is neither "satisfied" nor a status this
   step waits out — it HALTS the run before any dependent step executes. See step 9's
   "no `on_failure` clause" default rule, which governs every step that fails without a
   declared retry loop (`propose`, `design`, `implement-direct`, `document`, `push`).

   Steps with no `depends_on` in `workflow.yaml` execute in the file order listed there.

   Static-step agent mapping (file order):

   | Step | Agent |
   |---|---|
   | `propose` | analyst |
   | `research` | researcher |
   | `design` | architect |
   | `implement-direct` | developer |
   | `review` | reviewer |
   | `document` | tech-writer |
   | `push` | gitops |

   For each: `Task(subagent_type="scaffolding:<agent>", prompt=<substituted template>, description=<step id>)`.
   Treat `max_turns` / `timeout` as budget guidance stated inside the prompt — never enforce
   them; there is no preemption mechanism.

   `push` MUST delegate to `scaffolding:gitops` and MUST NOT run `git commit` / `git push`
   itself. gitops is the sole committer per `CLAUDE.md`.

7. **Expand the dynamic `implement` step**

   `implement` (`type: dynamic`, no static `agent`) expands at runtime from the architect's
   issue graph:

   a. Locate the `<!-- @data ... -->` HTML-comment block in the architect's output (fallback:
      the same block inside `{specs_path}design.md`).
   b. Parse the JSON inside it and validate against `output_schema`: object, `required:
      [issues]`, `issues` an array of objects each requiring `id`, `title`, `description`
      (the `json-schema` guardrail, step 8).
   c. For each issue, emit one `Task` to `scaffolding:<issue.agent>` (developer for
      `IMPL-*`, reviewer for `REVIEW-*`) carrying `title`, `description`, `files`,
      `acceptance_criteria`, plus `{specs_path}`, `{conversation_id}`, `{original_prompt}`.
   d. Order by each issue's own `depends_on`. Each `REVIEW-XXX` runs only after its paired
      `IMPL-XXX` completes.
   e. `/specs:run` executes IMPL/REVIEW issues **sequentially**, in dependency order, via
      plain `Task` calls. It does not spawn background teammates, generate a `runId`, name
      peers, inject the "Comms Protocol" block, or assign worktrees/`SCAFFOLDING_TASK_ID` —
      that machinery lives only in `agents/coordinator.md`. An agent invoked without a Comms
      Protocol block returns its result to this orchestrator rather than `SendMessage`-ing a
      peer (`agents/reviewer.md:329,339`), so this command has no wiring to run issues in
      parallel even when they are independent. Independent `IMPL-*` issues (empty
      `depends_on`, non-overlapping `files`) are still recorded as parallel-eligible in the
      trace — that metadata is exactly what `scaffolding:coordinator` needs — but real
      concurrent writer teammates are reached by delegating the run to
      `scaffolding:coordinator`, which owns the runId/Comms-Protocol/worktree machinery
      described in `docs/agent-teams.md`. `/specs:run` itself never schedules parallel
      writers.

   If the `@data` block is missing or unparseable, do NOT invent issues. Fall back to one
   `scaffolding:developer` Task driven by `{specs_path}tasks.md`, and mark the step
   `degraded (no issue graph)` in the trace.

8. **Evaluate guardrails after each step's `Task` returns**

   | Guardrail | Definition | On breach |
   |---|---|---|
   | `frontmatter-valid` (`lenient_on_exit_0: true`) | Output begins with the `templates/output-frontmatter.md` block (`agent`, `task`, `status`, `gate`, `score`, `files_modified`, `next_agent`); MAY pipe output through `validators/validate-agent-output.sh` | lenient: `status: success` + malformed/missing frontmatter is a WARNING in the trace, not a failure |
   | `json-schema` (`lenient_on_exit_0: true`, `design` only) | The `@data` JSON validates against `output_schema` | lenient: warn and continue if the step otherwise succeeded; `implement` still takes the degraded path |
   | `no-critical-issues` (`review` only, not lenient) | Reviewer output declares no CRITICAL findings (`severity: critical`, a critical entry in `issues`, or an explicit CRITICAL section) | **hard failure** -> `review.on_failure` engages |

   `lenient_on_exit_0: true` means: the guardrail cannot by itself fail a step the agent
   reported as successfully completed.

   A step "fails" when: its `Task` call itself errored; the agent's reported `status` is
   `failed` or `blocked`; or a non-lenient guardrail was breached. `status: partial_success`
   is NOT a failure — record it and continue.

9. **Honour retry loops, one independent counter per `on_failure`-bearing step**

   | Step | goto | max_loops | Semantics |
   |---|---|---|---|
   | `research` | `design` | 1 | forward/degraded jump — consuming the loop means "proceed to design without research"; never re-run `research` |
   | `review` | `implement` | 2 | backward jump — re-run whichever branch actually ran (`implement` or `implement-direct`), injecting the reviewer's findings into the retry prompt so it differs from the prior attempt |

   When a counter is exhausted: stop looping, mark the step `failed (max_loops exhausted)`,
   print the accumulated findings, and **halt before `document` and `push`** — never push
   unreviewed work. Offer the user: continue anyway, fix manually, or abort.

   `settings.max_steps: 20` is a global cap on total step executions (retries included);
   once reached, halt and report `max_steps` exhaustion.

   **Default rule for steps with no `on_failure` clause** (`propose`, `design`,
   `implement-direct`, `document`, `push` — only `research` and `review` declare one): if the
   step's `Task` errors, or the agent reports `status: failed`/`blocked`, mark that step
   `failed` and HALT the run immediately — do not proceed to any step that depends on it.
   Report which step failed and why (the agent's own error/status message), then offer the
   user exactly three choices via **AskUserQuestion**: retry the failed step as-is, pause so
   the user can fix the problem manually and then resume (`/specs:run --conversation <uuid>`),
   or abort the run. This is the tie-breaker step 6 refers to: a plain `failed` step is never
   silently treated as satisfied, and the run's own status becomes `halted` once reported.

10. **Present `review` as the integration review**

    Preserve the template's framing: reviews ALL changes together (cross-file consistency,
    alignment with `{specs_path}design.md`, merge conflicts between parallel branches,
    end-to-end coverage) — explicitly distinct from the per-change `REVIEW-*` steps already
    run inside `implement`. When `complexity == 'small'` (no `design.md`), instruct the
    reviewer to review against existing project patterns instead of reporting a missing
    `design.md` as a defect.

11. **Report progress incrementally, then persist the trace**

    Status vocabulary: `pending`, `running`, `succeeded`, `partial`, `skipped (condition
    false)`, `degraded (...)`, `failed`, `failed (max_loops exhausted)`, `halted`. Print a
    one-line update after every step completes, using this vocabulary.

    Merge (never overwrite) a `workflow` key into
    `.scaffolding/conversations/{conversation_id}/context.json`:
    `{ "last_run": <ISO timestamp>, "complexity": ..., "steps": [...] }`. The existing
    `openspec` key MUST survive unchanged. Advance `openspec.status` per the `spec-workflow`
    lifecycle as phases complete: `drafting` after `design`, `implementing` during
    `implement`, `reviewing` at `review`, `complete` after `push`.

**Output**

```
## Workflow Run Complete

**Conversation:** <uuid>
**Specs:** .scaffolding/conversations/<uuid>/specs/
**Complexity:** small | medium | large (inferred | explicit)
**Budget:** timeout_minutes: 120 (advisory, not enforced)

| Step | Agent | Status | Notes |
|------|-------|--------|-------|
| propose | analyst | succeeded | proposal.md written |
| research | researcher | skipped (condition false) | needs_research = false |
| design | architect | succeeded | 6 issues (3 IMPL / 3 REVIEW) |
| implement | dynamic | succeeded | IMPL-001..003 + REVIEW-001..003 (IMPL-002/003 parallel-eligible, ran sequentially) |
| implement-direct | developer | skipped (condition false) | complexity != small |
| review | reviewer | succeeded | loop 1/2, no criticals |
| document | tech-writer | succeeded | CHANGELOG updated |
| push | gitops | succeeded | pushed to <branch> |

**Loops used:** review 1/2, research 0/1
**Steps executed:** 7/20
```

Skipped steps MUST always appear in the table with `skipped (condition false)` — never
omitted.

**Limitations**

- This is an LLM interpreting `workflow.yaml` as data, not a real scheduler: no preemption,
  no true concurrency scheduling, no cancellation mid-step.
- `max_turns`, `timeout`, and `settings.timeout_minutes` are advisory budget text only —
  never enforced.
- A partially completed run cannot be resumed mid-step; re-invoke `/specs:run --conversation
  <uuid>` to continue from the persisted `context.json` trace.
- The condition table in step 4 is hand-coupled to `workflow.yaml`'s three `condition`
  strings. Editing `workflow.yaml`'s conditions requires updating this command's table too —
  flagged by a header comment in the YAML itself.
- No general-purpose expression evaluator, no new YAML schema, no support for arbitrary
  user-authored workflow files — only the plugin's own `workflows/workflow.yaml`.
- The parallel-IMPL path is **not reachable via `/specs:run` directly**: it issues plain
  sequential `Task` calls and has no runId/Comms-Protocol/worktree machinery. Real parallel
  writer teammates require delegating the run to the `scaffolding:coordinator` agent instead.

**Guardrails**
- The `conversation_id` MUST be a UUID — reject or regenerate if it looks like a descriptive name
- Never guess an unrecognised `condition` string — halt and report the step id and expression
- Never invent issues when the `@data` block is missing or unparseable — degrade to the single-developer fallback and record it
- Never push unreviewed work — exhausted retry loops halt before `document` and `push`
- Never commit or push directly — `push` always delegates to `scaffolding:gitops`
- Always show skipped steps in the trace table, never omit them
- Always merge into `context.json`, never overwrite the existing `openspec` key
