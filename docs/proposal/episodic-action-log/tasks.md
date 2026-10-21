# Episodic action log: tasks

Design: `design.md` (same dir). Order = dependency order. Each group is one PR.
**Invariant for every PR: metadata only. No raw tool output, file contents, Task
prompts, or MCP results are ever written.**

## 1. Plugin: extractor + redaction (komluk/scaffolding, PR 1)
- [ ] 1.1 `tests/scripts/sync-secret-patterns.py`: reads aiproxy `presidio_recognizers.json` (path arg), writes `hooks/lib/secret-patterns.json` with the D4 allowlist only. A test asserts `INTERNAL_DOMAIN`/`PRIVATE_IP` are absent and that no internal hostname literal is in the output.
- [ ] 1.2 `hooks/lib/action_log_lib/redact.py`: vendored patterns + D4 generic rules, fail-closed per field (`<redaction-error>`).
- [ ] 1.3 `hooks/lib/action_log_lib/extract.py`: `platform` adapter (`output.jsonl` step frames, `agent_start` -> agent, `tool_result.success` -> status, content never read) and `local` adapter (transcript + `subagents/*.jsonl` + `.meta.json`, `is_error` -> status, byte cursor, 10 MB/pass). D2 schema, D2 target allowlist, D7 caps + footer.
- [ ] 1.4 `hooks/lib/action_log.py` CLI (stdlib only, run with `python3 -I`): `platform --task-dir --conv-dir [--force]`, `local --transcript --session-id --conv-dir`, `render --conv-dir`, `backfill <root>`. Single-line `O_APPEND` writes, `umask 002`, exits 0 on any error.
- [ ] 1.5 Fixtures + tests in `tests/hooks/test-action-log.sh` (+ pytest file if available):
  - **Acceptance:** a Bash call `VAULT_TOKEN=hvs.X curl -H "Authorization: Bearer eyJ..." https://u:p@h/` is recorded with all 3 secrets stripped.
  - **Acceptance:** an Edit with `ghp_…` in `new_string` and a `tool_result` with `sk-ant-…` in content: neither string appears in `actions/*.jsonl` or `timeline.md` (grep the whole output dir for every planted secret).
  - **Acceptance:** heredoc body and Task `prompt` absent; MCP arg `token=` dropped.
  - **Acceptance:** malformed JSONL line / missing dir: exit 0, no partial record written.
  - **Acceptance:** a real sampled platform `output.jsonl` (sanitized fixture) yields N records == N `tool_call` frames; status `unknown` when no result.
- [ ] 1.6 Validation: `bash tests/run-all.sh`.

## 2. Plugin: summarize + local trigger (komluk/scaffolding, PR 2, depends on 1)
- [ ] 2.1 `hooks/lib/action_log_lib/render.py`: deterministic `timeline.md` (D5): per-run sections, errors, repeated failures (≥ 2 same tool+normalized target), 200-line cap, tmp+rename, redaction pass #2.
- [ ] 2.2 `hooks/action-log.sh` (Stop + SessionEnd): skip if `SCAFFOLDING_TASK_ID` set, `SCAFFOLDING_ACTION_LOG=off`, `.noactionlog`, or no `.scaffolding/conversations/`. `flock -n actions/.lock`, `timeout 5`, then `local` + `render`. Always exit 0.
- [ ] 2.3 Register in **both** `settings.json` and `.claude-plugin/plugin.json`: Stop (before `memory-ingest.sh`) + SessionEnd.
- [ ] 2.4 `hooks/memory-ingest.sh` directive: step 1 includes `timeline.md`; step 4 `log.md` line gains `| timeline: … (N calls, E errors)`; new step: `trigger_ingest(corpus, relative_path=<…>/conversations/<id>/timeline.md)` when available.
- [ ] 2.5 `skills/distill/SKILL.md`: `timeline.md` as the 3rd Conversation-Scoped input; repeated failure -> candidate, confidence 0.5 fixed (never auto-store).
- [ ] 2.6 Tests:
  - **Acceptance:** two consecutive Stop invocations on a growing transcript append only new calls (no dups; cursor advances).
  - **Acceptance:** subagent calls carry `agent=<type>` and `parent=<tool_use_id>`.
  - **Acceptance:** with `SCAFFOLDING_TASK_ID=x` the hook writes nothing.
  - **Acceptance:** Stop on a 45 MB transcript returns in < 5 s.
  - **Acceptance:** two identical failing calls -> "repeated failures: … ×2" in `timeline.md`.
- [ ] 2.7 Docs (tech-writer): `hooks/README.md` section + env flag row; CHANGELOG `[Unreleased]`, which supersedes the 2.18.0 "Evaluated, no change" note and explains why (metadata-only, derived, no new runtime). Version bump.
- [ ] 2.8 Validation: `bash tests/run-all.sh`. Security review (reviewer, opus) of redaction + allowlist before merge.

## 3. Platform: post-run extraction (komluk/scaffolding.tool, PR 3, depends on plugin release of 1-2)
- [ ] 3.1 Bump plugin pin (`devops/deployment/scripts/ensure-plugin.sh` / config) to the release from group 2.
- [ ] 3.2 `app/backend-node/src/execution/actionLog.ts` (new, keeps `processor.ts` under its line ceiling): `extractRunActions({projectPath, conversationId, taskId})` spawns `python3 -I <config.plugin.path>/hooks/lib/action_log.py platform …` then `render`, with a 15 s timeout, fail-open (warn log only), no shell (argv array), and validated ids (`validateConversationId`/`validateTaskId`). Then `trigger_ingest` via the existing memory MCP client, bounded by `AUTO_STORE_TIMEOUT_MS`.
- [ ] 3.3 Call it from `processor.ts` (after the terminal frame, for **every** terminal status, not only `completed`) and `workflowRun.ts` (next to `storeRunLearnings`).
- [ ] 3.4 Config flag `ACTION_LOG_ENABLED` (default true) in `config.ts` + `devops/infra/ansible/roles/env-config/templates/env.j2`.
- [ ] 3.5 Tests (vitest, spawn injected):
  - **Acceptance:** extractor exit 1 / timeout / missing script -> run terminal status and exit code unchanged; one warn logged.
  - **Acceptance:** argv contains no user-controlled string other than validated UUID paths.
  - **Acceptance:** flag off -> spawn not called.
- [ ] 3.6 Validation: `npm run validate` in `app/backend-node`. Live check after deploy: a platform run produces `actions/<task>.jsonl` + `timeline.md` on `/mnt/scaffolding/projects/<repo>/conversations/<conv>/`.

## 4. CT130: `kind=timeline` (komluk/homelab, PR 4, optional, independent of 3)
- [ ] 4.1 `ansible/playbooks/files/memory/ingest/pipeline.py` `_kind()`: `conversations/<id>/timeline.md` -> `timeline`. Test in `ingest/tests`.
- [ ] 4.2 `mcp/server.py` `search_context` docstring: list `timeline` among `kind` values. `docs/memory.md` parameter list updated.
- [ ] 4.3 Validation: memory `pytest`; eval gate unchanged (recall@10 ≥ 0.85, MRR@10 ≥ 0.70).
- [ ] 4.4 **Acceptance:** after `trigger_ingest` of a fixture timeline, `search_context("runs that edited memory.yml and failed", kind="timeline")` returns it in the top 5 with the right `session_id`.

## 5. Rollout + backfill (ops, after 3)
- [ ] 5.1 Backfill (dry-run first): `python3 -I action_log.py backfill /mnt/scaffolding/projects` -> timelines for historical runs (`status=unknown` before 2026-10-20). Does not touch `output.jsonl`.
- [ ] 5.2 **Acceptance (end to end):** a timeline for a known homelab run is found via `search_context` (no `kind` filter) within 1 min of run end.
- [ ] 5.3 **Acceptance (leak audit):** plant 10 test secrets (the same set as the claude-mem test) across Bash/Edit/MCP/tool_result in a scratch run, then `grep -r` the conversation's `actions/` + `timeline.md` + CT130 `search_context` results: 0 of 10 found.

## Deferred (v2, build only if needed)
- [ ] `get_actions` MCP tool in `komluk/homelab` `memory/mcp/actions.py` (structured filter over `actions/*.jsonl`: tool/kind/status/target/time/repo, path-guarded via `path_safety.py`). Trigger: timeline search proven too fuzzy for exact questions.
- [ ] Timeline view in the platform conversation UI.
