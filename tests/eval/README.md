# Routing eval

Golden set that checks the routing protocol in `CLAUDE.md` still sends prompts to the right agent.

| File | Purpose |
|------|---------|
| `routing.jsonl` | 41 generic prompts (EN/PL): `{"prompt", "expected_agent": "scaffolding:<agent>", "expected_difficulty": null}`. Every agent has at least 2 rows. |
| `denylist.sh FILE...` | Public-repo guard. Prints matching lines and exits 3 on private IPs, internal hostnames, ids and similar. |
| `run-routing.sh` | Runner (see below). |

## Offline (CI, no API key)

```bash
bash tests/eval/run-routing.sh --dry-run   # denylist + schema + agent coverage
bash tests/run-all.sh                      # same check via tests/hooks/test-routing-denylist.sh
```

## Live

```bash
bash tests/eval/run-routing.sh [--path FILE] [--limit N] [--model M]
```

Needs the `claude` CLI and a working API key/base URL in the environment. Per prompt it runs
`claude -p` with only the `Task` tool (no MCP, no user settings, plugin loaded via `--plugin-dir`, the plugin
`CLAUDE.md` appended as system prompt), reads the stream and kills the process at the first `Agent`/`Task`
`tool_use`, then records `input.subagent_type`. 60 s timeout per prompt (`NONE` = no delegation in time).
Prints accuracy and a confusion list. `--path` accepts a private set (the denylist still runs on it).
Exit codes: 0 ok, 1 schema/coverage error, 2 usage, 3 denylist hit.

Note: in Claude Code 2.1.x the subagent tool is named `Agent`; the runner accepts `Task` too.

## Baseline

| Date | CLI | Model | Accuracy |
|------|-----|-------|----------|
| 2026-10-19 | Claude Code 2.1.303 | CLI default | 38/41 (92.7 %) |

All 3 misses were `NONE` (no delegation within 60 s), not wrong-agent picks:
OAuth library research (researcher), slow SQL query (optimizer), parallel multi-agent run (coordinator).
Re-run to check variance before treating a change of one or two rows as a regression.
