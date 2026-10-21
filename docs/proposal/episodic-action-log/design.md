# Episodic action log: design

Status: proposal (not implemented). Date: 2026-10-20.
Primary repo: `komluk/scaffolding` (plugin). Secondary: `komluk/scaffolding.tool`, `komluk/homelab`.

## Context

We want automatic answers to questions like:

- "What did the agent do across these N runs on homelab?"
- "Which runs touched `ansible/playbooks/memory.yml`, and what broke?"
- "Reconstruct this outage as a timeline."
- "Did this approach fail more than once?"

We already store deliberate insights (`semantic_store`, the platform's `## Remember`
auto-store, `distill` -> tiers, `agent-memory/log.md`). We do not have an automatic
per-run record of what was done.

claude-mem is rejected. It stores raw tool outputs, its redaction is off by default
(6 of 10 keys leaked in our test), and a HIGH-risk audit was closed with no action.
The 2.18.0 CHANGELOG entry ("Evaluated, no change") also rejected a separate recorder
because it would add a runtime and capture secrets. This design avoids both problems:
**it adds no new capture and no new runtime, and it keeps only metadata.**

### What already exists (verified 2026-10-20)

| Source | Where | What it has | Gaps |
|---|---|---|---|
| Platform run stream | `<repo>/.scaffolding/conversations/<conv>/tasks/<task>/output.jsonl`, already on NFS (`/mnt/scaffolding/projects/<repo>/conversations/...`) | `step/tool_call` frames `{tool, input (whole), id, parent_tool_use_id?}`, `step/tool_result` `{success, content (truncated to 1000 chars), tool_use_id}`, `agent_start/agent_end` (agent name, status, duration), `error`, a `ts` per frame. Written by `app/backend-node/src/execution/frames.ts` | Runs before 2026-10-20 have **0 `tool_result` frames** (sampled: 6296 calls, 158 results, all from 2026-10-20), so status for old runs is `unknown`. `input` and `content` are raw and can hold secrets |
| Local CLI transcript | `~/.claude/projects/<slug>/<session_id>.jsonl`, plus `<session_id>/subagents/agent-*.jsonl` + `.meta.json` (`agentType`) | `tool_use` / `tool_result` blocks (`is_error`), `timestamp`, `cwd`, `sessionId` | Local disk only, not on NFS. Large (45 MB seen). Raw content |
| Hook plumbing | plugin `settings.json` / `.claude-plugin/plugin.json`: `Stop` (`memory-ingest.sh`), `SubagentStop` (`memory-ingest-mark.sh`) | Stop stdin includes `session_id`, `transcript_path`, `stop_hook_active` | Plugin hooks in **platform** runs: not verified. The backend uses `settingSources: []` and reimplements 8 hooks in TS (`agent/hooks.ts`) |
| Platform post-run point | `execution/processor.ts:410` and `workflowRun.ts:402` (`storeRunLearnings`, fail-open, after the terminal frame is written) | Has `projectPath`, `conversationId`, `taskId`, agent name, memory MCP client | `processor.ts` is at its line limit, so new code goes in a new module |
| Memory MCP (CT130) | `komluk/homelab` `ansible/playbooks/files/memory/{mcp,ingest}` | Ingest walks every `*.md` on the share (non-`.md` is skipped), derives `session_id` from `conversations/<id>/`, sets `kind` (`note`/`spec`/gitea). `search_context` filters: `corpus, path (exact doc_id), source_type, kind, session_id` | No time-range or action query |
| Secret patterns | `komluk/aiproxy` `ansible/playbooks/templates/aiproxy/presidio_recognizers.json` | 28 regex entities (GitLab/GitHub/Gitea/Vault/Anthropic/sk-/AWS/Slack/CF/Proxmox/Tailscale/NPM/Azure/PEM/...) | Includes `INTERNAL_DOMAIN`, which must not be copied into the public plugin repo |

## Goals / Non-Goals

Goals
- An automatic, per-run, **metadata-only** action log for platform runs and local sessions.
- A short, readable per-run timeline in the conversation tier, indexed into CT130 so
  `search_context` finds it.
- Redaction as defense in depth, even though no raw output is kept.
- Bounded size, plus retention.

Non-goals
- **No raw tool output, file contents, Bash stdout/stderr, diffs, MCP results, or
  subagent prompts, ever.** `tool_result.content` is never read past the `success` /
  `is_error` flag.
- No new PostToolUse hook, worker, database, or vector store.
- No LLM in capture or summarize. Both are deterministic.
- No cross-device sync of local transcripts. Only the derived log goes to NFS.

## Decisions

### D1. Capture: derive from existing run logs; no new PostToolUse hook
**Chosen:** one stdlib Python extractor, `hooks/lib/action_log.py` (plugin), with two
input adapters:
- `platform`: reads `tasks/<task>/output.jsonl`.
- `local`: reads the CLI transcript at `transcript_path`, plus its `subagents/*.jsonl`.

Both adapters produce the same metadata records (D2).

**Alternatives considered**
- *New PostToolUse hook that appends one line per call.* Rejected. The data already
  exists in both environments. It would also spawn a process on every tool call (the
  hot path) and duplicate the stream the platform already writes. Whether plugin hooks
  fire under the platform's `settingSources: []` is unverified, so platform coverage
  would be uncertain.
- *Extract inside CT130 ingest (it already walks the NFS share).* Rejected. It would
  put raw-output parsing in a shared service. It also cannot see local transcripts,
  which never reach NFS.
- *Rewrite the extractor in TypeScript in the backend.* Rejected. That means two
  implementations and two copies of the redaction rules. The backend calls the plugin
  script instead (D3).

### D2. Record schema (metadata only)
One JSON object per tool call, one file per run:
`conversations/<conv>/actions/<run_id>.jsonl`.

```json
{"v":1,"ts":"2026-10-20T11:35:02.431Z","src":"platform","conv":"63633461-8a24-421c-bcab-fab23dda66aa",
 "run":"1a7ed061-9bf7-41d6-8309-49578df8d803","repo":"homelab","agent":"gitops","parent":null,
 "seq":4,"id":"toolu_016FwD4wAYLa33fsXJqCqzSL","tool":"mcp__platform__merge_pr","kind":"mcp",
 "target":"merge_pr owner=komluk repo=homelab index=242 merge_style=squash","status":"error"}
```

| Field | Type | Rule |
|---|---|---|
| `v` | int | Schema version, `1` |
| `ts` | ISO-8601 UTC | Platform: frame `ts`. Local: block `timestamp` |
| `src` | `platform` \| `local` | Adapter |
| `conv` | UUID | Platform: conversation_id. Local: `session_id` (also a UUID) |
| `run` | string | Platform: task_id. Local: `session_id`. A subagent is not its own run; it is marked by `agent` + `parent` |
| `repo` | string | basename of project dir (matches the nfs-sync bucket) |
| `agent` | string | `main`, or the subagent type with `scaffolding:` stripped (platform: from `agent_start`; local: from `subagents/*.meta.json` `agentType`) |
| `parent` | string \| null | `parent_tool_use_id` (the Task/Agent call that spawned the subagent) |
| `seq` | int | Order within the run |
| `id` | string | `tool_use_id`. Joins call and status. Not secret |
| `tool` | string | Tool name as emitted |
| `kind` | enum | `edit` (Edit/Write/NotebookEdit), `read` (Read), `search` (Grep/Glob), `exec` (Bash), `agent` (Task/Agent), `web` (WebFetch/WebSearch), `mcp` (`mcp__*`), `other` |
| `target` | string ≤ 120 | Short safe descriptor (table below), redacted (D4) |
| `status` | `ok` \| `error` \| `unknown` | From `tool_result.success` / `is_error` only. `unknown` when there is no result (old runs, killed runs) |

A run's last line may be a footer:
`{"v":1,"run":...,"end":true,"status":"completed|failed","calls":N,"errors":E,"truncated":0}`.

**Target descriptor rules.** Allowlist only: anything not listed here is dropped.

| Tool | `target` |
|---|---|
| Edit / Write / NotebookEdit / Read | `file_path`, relative to the project root when it is inside it, otherwise `$HOME` is replaced with `~`. Never `content` / `old_string` / `new_string` |
| Bash | The first line of `command`, cut at the first `<<` (heredoc) or `\|base64`. `VAR=value` prefixes become `VAR=***`. Then redacted and truncated to 80 chars. If the input has `description`, it is appended as ` — <description>` (redacted, ≤ 60) |
| Grep / Glob | `pattern` (≤ 60) + ` in ` + `path` |
| Task / Agent | `subagent_type` + `: ` + `description` (≤ 80). **Never `prompt`** |
| WebFetch | URL scheme+host+path. Query string and userinfo dropped |
| WebSearch | `query` (≤ 60, redacted) |
| `mcp__<srv>__<tool>` | Tool short name plus scalar args from an allowlist: `owner repo index pull_number number method state branch ref corpus relative_path project_id node vmid name path file_path`, each ≤ 60 chars. Arg names matching `/token\|secret\|key\|pass\|auth\|cred\|content\|body\|text\|prompt\|query\|data/i` are always dropped |
| TodoWrite, others | Tool name only. TodoWrite is counted but not listed in the timeline |

### D3. Where extraction runs (trigger placement)
| Environment | Trigger | Why |
|---|---|---|
| Platform run | **Backend post-run step**, next to `storeRunLearnings` (new module `execution/actionLog.ts`, called from `processor.ts` and `workflowRun.ts`). Runs `python3 -I <config.plugin.path>/hooks/lib/action_log.py platform --task-dir <dir> --conv-dir <dir>` with a 15 s timeout, fail-open | It runs after the terminal frame is written, so the stream is complete and there is no race. It runs once per run and is independent of whether plugin hooks fire under `settingSources: []`. The backend already calls plugin assets by the pinned path. It does not change `output.jsonl` |
| Local session | **New plugin Stop hook `hooks/action-log.sh`** (incremental), plus **SessionEnd** for the final render | Stop stdin provides `transcript_path` and `session_id`. It is cheap: a byte-offset cursor means only new lines are parsed. The hook skips itself when `SCAFFOLDING_TASK_ID` is set (platform run), the same pattern as `auto-init-check.sh` |

Local cursor: `conversations/<sid>/actions/.cursor.json` stores `{file: byte_offset}`
per transcript/subagent file. The hook reads at most 10 MB per invocation, so a
resumed 45 MB transcript catches up over a few turns and never exceeds the hook
timeout. Records are appended to `actions/<sid>.jsonl`.

Gates: the hook is **off by default** and needs an explicit opt-in: env
`ACTION_LOG_ENABLED` set to a truthy value (`1`/`true`/`yes`/`on`, case-insensitive) or a
per-repo `.scaffolding/.actionlog` sentinel. It is also a no-op unless
`.scaffolding/conversations/` exists. Skips always win over opt-in: `SCAFFOLDING_TASK_ID`
set (platform run), `SCAFFOLDING_ACTION_LOG=off`, and a `.scaffolding/.noactionlog`
sentinel. These skips remain as overrides, but they are no longer the primary control.
The local `ACTION_LOG_ENABLED` switch is separate from the backend flag of the same name:
neither enables the other. On any error it exits 0 and writes nothing.

### D4. Redaction (defense in depth)
It runs **inside `action_log.py`, before any byte is written**, on every string field
(`target`, `agent`, args). It runs a second time on the rendered `timeline.md`.

1. **Vendored aiproxy patterns.** `hooks/lib/secret-patterns.json` is generated from
   aiproxy `presidio_recognizers.json` by `tests/scripts/sync-secret-patterns.py`.
   It keeps the secret-class entities: `GITLAB_PAT, LINEAR_API_KEY, ANTHROPIC_API_KEY,
   VAULT_TOKEN, NPM_TOKEN, GITEA_PAT, CLOUDFLARE_TOKEN, PROXMOX_TOKEN, TAILSCALE_KEY,
   SK_PREFIXED_KEY, AZURE_DEVOPS_PAT, AZURE_AD_SECRET, AZURE_SAS_TOKEN, STORAGE_KEY_B64,
   NUGET_API_KEY, PEM_PRIVATE_KEY, GITHUB_TOKEN, AWS_ACCESS_KEY, SLACK_TOKEN`, plus
   `PL_PESEL, IBAN_SPACED, PL_BANK_ACCOUNT`. It **excludes `INTERNAL_DOMAIN` and
   `PRIVATE_IP`.** The domain regex would leak the internal hostname into the public
   GitHub plugin, and host IPs are useful in an ops timeline (the log stays in our own
   store, and aiproxy masks them again on egress to the LLM).
2. **Generic rules** (in code, independent of aiproxy):
   `(?i)\b(token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|client[_-]?secret|authorization)\b\s*[=:]\s*\S+` -> `<name>=***`;
   `(?i)(authorization|x-api-key|private-token)\s*:\s*[^'"]+` -> `<hdr>: ***`;
   `(?i)bearer\s+\S+` -> `Bearer ***`; URL userinfo `://[^/@\s]+@` -> `://***@`;
   `-p\S+` / `--password[= ]\S+` -> `***`; any run of ≥ 32 `[A-Za-z0-9+/_=-]` chars that
   is not a hex git SHA (40 hex) -> `***`.
3. **Fail-closed on content, fail-open on the run.** If redaction throws, the field is
   replaced with `<redaction-error>` and the record is still written. The run is never
   affected.

The real protection is structural: raw outputs and file contents are never read into
a record (D2 allowlist). Redaction only covers what is left in command lines and
arguments.

### D5. Summarize: deterministic per-run timeline in the conversation tier
`action_log.py render --conv-dir <dir>` regenerates
`conversations/<conv>/timeline.md` from `actions/*.jsonl`. It writes a temp file and
renames it, so the replace is atomic on NFS. The output is deterministic, with no LLM:

```markdown
# Action timeline — homelab — conversation 63633461-…
runs: 3 · 2026-10-19 14:02 → 2026-10-20 11:35 UTC · calls 412 · errors 9

## Run 1a7ed061 — gitops — 2026-10-20 11:33–11:35 — completed (2 calls, 1 error)
- files edited: CLAUDE.md
- commands: git push origin cc/pve-mcp-doc
- mcp: gitea pull_request_read get_reviews repo=homelab pull_number=242
- errors: 11:33:00 mcp__platform__merge_pr repo=homelab index=242
- repeated failures: —
```

Each run section has: agent(s), start/end, footer status, call counts by `kind`,
files edited (unique, ≤ 30), files read (count plus the top 10 by frequency),
commands (deduplicated, ≤ 20), MCP calls (deduplicated, ≤ 15), subagents spawned,
errors (ts, tool, target, ≤ 20), and **repeated failures**: the same `(tool,
normalized target)` with `status=error` at least twice in the run, also aggregated
across runs in the header. Size cap: 200 lines. The 10 newest runs are shown in
full; older runs are collapsed to one line each.

**Hook into the existing distill path (small edits, no new mechanism):**
- `memory-ingest.sh` directive: step 1 also points `distill` at `timeline.md`. Step 4's
  `log.md` line gains `| timeline: conversations/<id>/timeline.md (N calls, E errors)`.
- `skills/distill/SKILL.md`, Conversation-Scoped inputs: add `timeline.md` as a third
  input. A *repeated failure* (≥ 2) becomes a gotcha candidate with fixed confidence
  0.5, so it goes to `.ingest-queue` / `/learn` and is never auto-stored.

### D6. Index + query: `search_context` is enough for v1; no new MCP tool yet
- `timeline.md` is a normal `.md` under `<corpus>/.../conversations/<id>/`. The
  CT130 ingest already picks it up on its 15-min pass, with `session_id` derived and
  `kind=note`. **`actions/*.jsonl` is never ingested**, because ingest skips non-`.md`.
- The `memory-ingest.sh` directive tells the agent to call `trigger_ingest(corpus,
  relative_path)` once `timeline.md` is rendered (local, agents with the tool). The
  platform post-run step calls `trigger_ingest` through the backend's existing memory
  MCP client (`modules/memory/client.ts`), fail-open and bounded by
  `AUTO_STORE_TIMEOUT_MS`.
- Query examples that work with today's tool: `search_context("which runs touched
  ansible/playbooks/memory.yml and failed", corpus="projects")`, or by conversation:
  `session_id=<uuid>`. Grouping by `doc_id` returns one hit per timeline.
- **Small CT130 change (recommended, not a new tool):** in `ingest/pipeline.py`
  `_kind()`, return `timeline` for `.../conversations/<id>/timeline.md`, and allow
  `kind="timeline"` in the `search_context` docstring. That gives a precise filter
  ("only action timelines") for one line plus a test. Without it, v1 still works with
  `kind=note`.
- **Deferred (v2), `get_actions` tool:** structured filtering (`tool`, `kind`,
  `status`, `target~`, time range, `repo`) over `actions/*.jsonl` on the share,
  returning records rather than prose. Build it only if semantic search over the
  timelines proves too fuzzy for exact questions (for example "every run that ran
  `tofu apply` on stack X"). It would go in `komluk/homelab` `memory/mcp/server.py`
  (currently 499 lines, so as a new module `actions.py`, reusing `path_safety.py`
  for path guards). Until then, `grep`/`jq` over `actions/*.jsonl` on NFS covers
  exact lookups.

### D7. Retention / size
- Per-run file cap: **5,000 records or 2 MB**, whichever comes first. After that, only
  `status=error` records and `kind in {edit, exec, agent}` are kept, and the footer's
  `truncated` counter is incremented. A typical platform run has 2 to 320 calls
  (sampled), at roughly 250 B/record, so under 100 KB.
- Per-conversation cap: 50 MB of `actions/`. Beyond that, the oldest run files are
  rotated to `actions/<run>.jsonl.gz` (keep). `timeline.md` keeps its 200-line cap.
- Retention: `actions/` follows the conversation directory lifecycle. Archive or
  delete of a conversation removes it, and CT130 reconcile drops `timeline.md` chunks
  when the `.md` is deleted. No separate TTL in v1.
- Platform `output.jsonl` and local transcripts are **untouched** and keep their own
  retention. The action log is derived from them and can always be regenerated
  (`action_log.py platform --task-dir ... --force`).

### D8. NFS / concurrency safety
- One writer per run file. The platform post-run step runs once per task. Local
  Stop/SessionEnd for one session runs serially (and with `flock -n` on
  `actions/.lock`; if the lock is busy, skip, since the next Stop catches up). So
  there is no shared mutable file. This contrasts with claude-mem's SQLite, which is
  unsafe on NFS.
- Appends are single `write()` calls of one line each (< 4 KB, `O_APPEND`). A crash
  mid-file leaves at most one partial last line, which the reader skips.
- `timeline.md` is written as tmp + `rename` (atomic on the share). Render is
  idempotent and can safely be re-run by both environments.
- Ownership: on the share, the files are created with `umask 002` (same as
  `nfs-sync.sh`).

## Specifications

### Requirement: metadata-only capture
The extractor SHALL write only the D2 fields and SHALL NOT copy `tool_result.content`,
file contents, `old_string/new_string/content`, Task `prompt`, or MCP non-allowlisted args.

#### Scenario: Edit records path only
- **GIVEN** a run with an Edit call whose `new_string` contains `hvs.ABC...`
- **WHEN** the extractor runs
- **THEN** the record's `target` is the relative `file_path`, and no record or
  `timeline.md` contains `hvs.`

#### Scenario: tool_result content is never read into output
- **GIVEN** a `tool_result` whose content contains `ghp_` + 36 chars
- **WHEN** the extractor runs
- **THEN** the matching record has `status` only, and the string is absent from
  `actions/*.jsonl` and `timeline.md`

### Requirement: secret stripping in commands
Bash `target` SHALL pass D4 redaction before write.

#### Scenario: inline secret in Bash
- **GIVEN** `VAULT_TOKEN=hvs.CAESI... curl -H "Authorization: Bearer eyJabc..." https://u:p@host/x`
- **WHEN** recorded
- **THEN** target is `VAULT_TOKEN=*** curl -H "Authorization: ***" https://***@host/x`
  (or stricter), and none of the 3 secrets appear

#### Scenario: heredoc body dropped
- **GIVEN** `cat > .env <<EOF\nDB_PASSWORD=x\nEOF`
- **THEN** target is `cat > .env` and nothing after `<<` is kept

### Requirement: coverage of both environments
#### Scenario: platform run
- **GIVEN** a completed or failed platform task
- **WHEN** the terminal frame is written
- **THEN** `conversations/<conv>/actions/<task>.jsonl` and `timeline.md` exist within
  15 s, and the run's result or exit code is unchanged even if the extractor fails

#### Scenario: local session
- **GIVEN** a local session with `.scaffolding/conversations/` linked to NFS
- **WHEN** a turn ends (Stop)
- **THEN** new tool calls since the previous Stop are appended (cursor), subagent calls
  carry `agent` from `subagents/*.meta.json`, and the hook is a no-op when
  `SCAFFOLDING_TASK_ID` is set

### Requirement: fail-open
#### Scenario: extractor crash
- **GIVEN** a malformed `output.jsonl` or an unreachable share
- **WHEN** capture runs
- **THEN** the hook or step exits 0 / resolves, logs a warning, and does not block,
  delay (beyond its timeout), or fail the run

### Requirement: searchable timeline
#### Scenario: find runs that touched a file and failed
- **GIVEN** a rendered `timeline.md` listing `ansible/playbooks/memory.yml` and an error
- **WHEN** `search_context("runs that edited memory.yml and failed")` is called after
  `trigger_ingest`
- **THEN** that timeline is in the top 5 results with the correct `session_id`

### Requirement: repeated-failure detection
#### Scenario: same failing call twice
- **GIVEN** two `status=error` records with the same tool and normalized target
- **THEN** `timeline.md` lists it under "repeated failures" with count 2, and distill
  emits a 0.5-confidence candidate to `.ingest-queue`, not to `semantic_store`

## Risks / Trade-offs
- [Old platform runs have no `tool_result`, so `status=unknown`] -> Accepted.
  Correct from 2026-10-20 on. Backfill CLI produces call timelines for history anyway.
- [Regex misses a novel secret format inside a command line] -> Bash targets are first
  line only, ≤ 80 chars, with heredoc/env-assign stripping. Redaction runs twice
  (record + timeline). aiproxy masks again on LLM egress. Patterns are synced from one
  source (aiproxy) with a CI drift check.
- [Vendoring aiproxy patterns into a public repo] -> Only secret-class regexes (they
  are public token formats). `INTERNAL_DOMAIN`/`PRIVATE_IP` excluded, and a sync
  script test asserts this.
- [Platform depends on a plugin script path] -> Same pinned `config.plugin.path` the
  run already loads. A missing script logs a warning and skips (fail-open). The
  plugin pin bump is the only release coupling.
- [Large local transcripts slow Stop] -> Byte cursor, 10 MB per pass, 5 s budget. The
  catch-up is spread over turns.
- [Timeline is prose, so exact queries are fuzzy] -> `kind=timeline` filter (CT130 one-liner).
  `get_actions` is scoped as v2 and built only if needed.
- [Local `conv` = CLI `session_id` differs from a platform conversation UUID] ->
  Accepted. Both are UUIDs and live in separate directories. `src` disambiguates.

## Migration Plan
- [ ] Ship plugin release (extractor + Stop hook + distill edits). Local capture stays
      OFF until a user opts in (`ACTION_LOG_ENABLED=1` or `.scaffolding/.actionlog`).
      `SCAFFOLDING_ACTION_LOG=off` or `.noactionlog` force-skips it.
- [ ] Bump the platform plugin pin, then ship the backend post-run step behind
      `ACTION_LOG_ENABLED` (default `true`, env-config role in scaffolding.tool).
- [ ] Optional: CT130 `kind=timeline` via the homelab pipeline (memory deploy).
- [ ] Optional backfill: `action_log.py platform --backfill <share>/projects/*/conversations`.
- Rollback: turn off the env flag (plugin and/or backend). Derived files can be
  deleted (`rm -r conversations/*/actions conversations/*/timeline.md`). Sources are
  untouched.

## Scaffolding Constraints
- Files < 500 lines (`action_log.py` split into `action_log.py` CLI + `action_log_lib/{extract,redact,render}.py` if it grows past ~400).
- Edits ≤ 200 lines per operation.
- Validation: plugin `bash tests/run-all.sh` (+ `python3 -m pytest tests/hooks/action_log` if pytest present); backend `npm run validate` in `app/backend-node`; homelab memory `pytest` in `ansible/playbooks/files/memory/{ingest,mcp}/tests`.
- Chain: developer (plugin) -> reviewer (opus, security: redaction) -> gitops; developer (backend) -> reviewer -> gitops; developer (homelab) -> gitops.

## Open Questions
1. Local `conv`: use the CLI `session_id`, or a scaffolding conversation UUID when the
   session is working on a spec conversation? v1 uses `session_id`.
2. Should host IPs be masked in timelines too (`PRIVATE_IP`)? v1 keeps them
   (operational value). Flip by adding the entity to the sync allowlist.
3. Does the platform want the timeline surfaced in the UI (conversation view)? Out of
   scope for v1. The file is on NFS and readable by the existing conversation routes.
4. Should plugin hooks fire under the platform's `settingSources: []`? Not needed by
   this design (D3), but if they do, the Stop hook's `SCAFFOLDING_TASK_ID` guard
   prevents double capture.
