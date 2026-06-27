# Agent Teams (experimental, parallel writers)

**Flag:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` — **default OFF (sequential).**

Agent Teams lets the coordinator run **independent writer teammates in parallel**
(not just the read-only fan-out that already exists). It is experimental and
behind an env flag because parallel writers stress the two load-bearing
invariants: **gitops-only-commit** and **worktree isolation**. This document
defines the flag, the data-contract handoff, and the **mandatory** safety
constraints. None of them are optional.

## Default vs team mode

| | Default (flag unset) | Team mode (`...AGENT_TEAMS=1`) |
|--|----------------------|--------------------------------|
| Read-only agents | parallel via existing fan-out (`MAX_PARALLEL=4`) | unchanged |
| Writers (developer) | strictly sequential | **may** run in parallel iff non-file-overlapping |
| Commits/merges | gitops only, serialized | gitops only, serialized (unchanged) |

When the flag is unset, behavior is exactly today's: developer/reviewer/gitops
run sequentially. The flag only unlocks parallel *independent developer
worktrees*; it never parallelizes committing.

## Mandatory constraints (non-negotiable)

1. **Per-writer isolated worktree.** Each writer teammate runs in its OWN
   worktree `.scaffolding/worktrees/{task_id[:12]}` with its OWN unique
   `SCAFFOLDING_TASK_ID`. No two writers share a working tree or a
   `/tmp/scaffolding-mtime-${TASK_ID}.json` staleness store. Shared trees would
   trip `file-staleness-check.sh` against each other (exit-2 storms) and produce
   unattributable interleaved changes.

2. **No teammate commits.** Writers produce *uncommitted* changes in their
   worktree. **gitops is the sole committer.** Do not relax `gitops`
   `disallowedTools` and do not grant Write/Edit + commit authority to any other
   agent. Teams change orchestration only, never commit authority.

3. **gitops serializes merges.** gitops merges worktree branches to main **one at
   a time** via the existing `merging`→`merged` state machine, resolving
   conflicts between parallel branches. Parallel *work* is allowed; parallel
   *committing/merging* is not — only one merge is ever in flight.

4. **Writers parallelize only when independent.** Writers may run concurrently
   ONLY when the architect's issue graph marks them as **non-file-overlapping**
   (the `workflow.yaml` design step already emits independent IMPL issues with no
   cross-deps). Overlapping work falls back to sequential.

5. **Coordinator guardrails unchanged.** `MAX_PARALLEL=4` stays. developer,
   reviewer, and gitops are NEVER parallel *peers of each other*; teams
   parallelize independent **developer** worktrees, never duplicate gitops or run
   a reviewer/gitops concurrently with the developer they depend on. Coordinator
   remains non-recursive (cannot spawn another coordinator).

## Data-contract handoff

Teammates hand off via the existing `agent-comms` SendMessage protocol —
**reused unchanged**:

- **Recipient validation** (`agent-comms` §1): every SendMessage `to:` is
  validated (exact-match-first, single suffix-strip) before sending. Replica
  names like `developer-1` are admitted; spoofed lookalikes are rejected.
- **worktreePath validation** (`agent-comms` §2): gitops and reviewer validate
  any received `worktreePath` (absolute + under repo root, no `..`, not a
  symlink, exists, registered git worktree by exact match) before any `cd`/git
  op. This is exactly the guard that makes parallel worktree handoff safe.

Handoff topology is the standard pipeline, per independent worktree:

```
architect (emits independent IMPL issues)
   ├─ developer-1 (worktree A, TASK_ID a) ─┐
   ├─ developer-2 (worktree B, TASK_ID b) ─┤ SendMessage(worktreePath) ─▶ gitops
   └─ developer-N (worktree N, TASK_ID n) ─┘   (validates each, merges serially)
                                              reviewer reviews integration
```

gitops receives each worktreePath, validates it, then merges branches to main
sequentially. The reviewer's integration step reviews merge conflicts or
incompatible changes between the parallel branches.

## Safety summary

| Risk | Mitigation |
|------|-----------|
| Parallel writers corrupt a shared tree | Mandatory per-writer isolated worktree + unique `SCAFFOLDING_TASK_ID` |
| Two agents commit | gitops-only-commit; `disallowedTools` unchanged on all non-gitops agents |
| Concurrent merges race main | gitops serializes merges (one in flight) |
| Staleness store collision | Per-task `/tmp/scaffolding-mtime-${TASK_ID}.json`; unique IDs enforced |
| Spoofed peer / malicious path | `agent-comms` §1/§2 validation, unchanged and required |
| Flag flips behavior silently | Strictly opt-in env var; default sequential; experimental |

## Rollout

Strictly opt-in / experimental. Default OFF. Do not let any release make
parallel writers the default. With the flag unset, the system behaves exactly as
the sequential pipeline does today.
