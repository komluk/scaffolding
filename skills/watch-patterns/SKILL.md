---
name: watch-patterns
description: "Correct construction of watchers for long-running operations. TRIGGER when: arming observation of a long-running operation (CI run, deploy, transfer, GC/prune, log stream), writing poll/until loops, or using the Monitor tool. SKIP: defining production alerts/metrics (use monitoring-observability); log formatting (use logging-standards)."
---

# Watch Patterns Skill

## Purpose
How to observe long-running operations correctly. Anyone can run a loop — the
value is a watcher that **never lies**: it terminates, it detects failure as
reliably as success, and its silence is never mistaken for progress.

Key architectural fact: a subagent cannot hold a long-lived observation.
Notifications from an armed `Monitor` land in the conversation that armed it;
a subagent finishes and dies. Observation is therefore always armed by the
main loop — this skill is loadable anywhere for exactly that reason.

## Auto-Invoke Triggers
- Watching a CI run, deployment, file transfer, GC/prune job, or log stream
- Writing any poll/`until` loop over a remote or local state
- Using the `Monitor` tool or `Bash(run_in_background)` for observation

---

## Decision Tree — Choose the Mechanism FIRST

The single most common failure is picking the wrong mechanism. Decide BEFORE
writing any script:

| Situation | Mechanism |
|-----------|-----------|
| "Is it done *now*?" — answerable immediately | **One-shot check.** Single command, no loop, no monitor. |
| ONE notification when a condition becomes true (deploy finished, download complete, GC done) | **`Bash(run_in_background)` + `until` loop** with a terminal condition and a bounded iteration count. NOT `Monitor`. |
| REPEATING events, each occurrence matters (every error line, every restart) | **`Monitor` tool** with a filter covering ALL terminal states. |
| CI run status (Gitea Actions) | **MCP polling**: `mcp__gitea__actions_run_read` polled until `status` is terminal. Structured status beats scraping logs. |
| Metric/log condition (error rate, service down) | **MCP**: `mcp__grafana__query_prometheus` / `query_loki_logs`. One query returns aggregated truth; a bash loop re-derives it badly. |
| You only need the outcome eventually, no urgency | **Do nothing now.** Check once when the result is actually needed. |

### Anti-pattern (observed failure)

Unbounded `tail -f` / `while true` piped into `Monitor` when only ONE
notification was needed → the tool stays armed until timeout, and every
intermediate line risks a spurious notification. Single notification =
`Bash(run_in_background)` + `until`; `Monitor` is for recurring events only.

### Canonical single-notification pattern

```bash
# Bash(run_in_background): fires ONCE, always terminates
for i in $(seq 1 120); do            # bound: 120 × 30s = 1h hard ceiling
  STATUS=$(remote_status_cmd 2>&1) || STATUS="PROBE_FAILED"
  case "$STATUS" in
    *done*|*success*)  echo "RESULT: success — $STATUS"; exit 0 ;;
    *failed*|*error*)  echo "RESULT: failed — $STATUS";  exit 1 ;;
  esac
  sleep 30
done
echo "RESULT: timeout after 1h — last status: $STATUS"; exit 2
```

Every branch — success, failure, probe error, timeout — produces output. There
is no code path that ends in silence.

---

## Terminal-State Coverage (the filter must catch failure)

A filter that only matches the happy path makes a crash indistinguishable from
"still running". Before arming ANY watcher, ask:

> **"If this process died right now, would my filter emit anything?"**

If the answer is no, the watcher is broken — fix it before arming.

| Filter | Verdict |
|--------|---------|
| `grep "success"` | BAD — crash = silence |
| `grep -E "success\|complete"` | BAD — still only happy path |
| `grep -E "success\|complete\|fail\|error\|fatal\|panic\|denied\|timeout"` | GOOD — alternation covers terminal states |
| `until ! kill -0 "$PID" 2>/dev/null; do sleep 1; done; echo "exited rc=$(cat rcfile 2>/dev/null)"` | GOOD — process disappearance IS the event |

Rules:
- Watch the **process/run lifecycle**, not just log content, whenever possible
  (exit code, PID disappearance, API `status` field). Logs lie by omission;
  exit states don't.
- For log filters, always include the failure vocabulary of the specific tool
  (`FAILED`, `ERROR`, `fatal:`, `Traceback`, `panicked`, `unreachable`) — read
  a sample of real output first to learn it.
- Bound every loop (max iterations) instead of `while true` whenever the
  operation is expected to finish. Timeout is a terminal state too — emit it
  explicitly. Unbounded loops convert "it never finished" into silence.

---

## Script Hygiene

| Concern | Rule |
|---------|------|
| Buffering | Pipelines swallow lines: use `grep --line-buffered`, `awk '{print; fflush()}'`, `stdbuf -oL` for stubborn tools. NEVER put `head -N` mid-stream — it SIGPIPEs the producer and kills the pipeline early. |
| Stderr | Always `2>&1` on commands you spawn — crashes print to stderr, and a filter reading only stdout misses them. |
| Transient errors | A remote probe MAY fail transiently: `OUT=$(curl -fsS "$URL" 2>&1) || OUT="PROBE_FAILED: $OUT"` — capture and classify; a blind `\|\| true` on every command converts persistent outage into silence. Count consecutive failures; N in a row = terminal state "target unreachable". |
| Intervals | Remote APIs / SSH probes: **≥ 30 s**. Local files/processes: 0.5–1 s. Hammering a remote API is both rude and a great way to get rate-limited into false "failures". |
| Idempotent probes | Each iteration must be self-contained. Do not cache a mount path, connection, or PID across iterations — re-resolve it (see autofs warning below). |

---

## Address & Secret Acquisition (NEVER hardcode)

**IP addresses in the model's context window may be MASKED (`<PRIVATE_IP>`).**
You cannot copy an IP from context into a script — you would arm a watcher
pointed at a placeholder or an empty string. Observed failure: `$NAS` was
empty → `/dev/tcp//22: Invalid argument` — the script "ran" but observed
nothing.

**Always extract addresses programmatically at runtime, then PROVE expansion:**

```bash
# From fstab (NFS/CIFS targets):
NAS=$(awk '$3 ~ /nfs/ {split($1,a,":"); print a[1]; exit}' /etc/fstab)
# From ssh config (resolves aliases, keys, jumps):
PVE=$(ssh -G pve | awk '$1=="hostname"{print $2}')
# From Proxmox guest config (on the PVE host):
VMIP=$(ssh pve "qm config 119 | grep -oP 'ip=\K[0-9.]+'")
# LXC equivalent: pct config <id>
# From Vault:
TOKEN=$(vault kv get -field=api_token kv/influxdb/api)

# MANDATORY expansion test BEFORE arming anything:
echo "NAS=[$NAS] PVE=[$PVE]"
[ -z "$NAS" ] && { echo "FATAL: NAS resolution failed"; exit 1; }
```

Heredoc gotcha (observed failure): a quoted heredoc (`<<'EOF'`),
single-quoted string, or single-quoted remote ssh command does NOT expand
`$VAR` — the script receives the literal text `$NAS`. If you template a
script, `echo` the assembled command and eyeball the resolved values before
arming.

**Environment state drifts between invocations** (observed failure): autofs
unmounts idle shares after ~60 s, so `mount | awk ...` that worked during your
probe returns empty inside the loop. `/etc/fstab` is the stabler source.
Prefer probes that trigger/withstand the state change (`stat /mnt/share/file`
re-triggers automount; `/dev/tcp/$HOST/22` doesn't need the mount at all), and
re-resolve state inside each iteration.

---

## Pre-Arm Self-Check (MANDATORY)

Do not arm any background watcher until every box is checked:

- [ ] **Terminates by itself?** `until` with terminal condition + bounded iteration count. No `while true`, no bare `tail -f`.
- [ ] **Catches failure AND crash?** Apply the "if it died right now" test. Failure vocabulary included. Timeout emits explicitly.
- [ ] **Variables expand?** `echo` of every resolved variable, non-empty asserted (`[ -n "$X" ]`).
- [ ] **Target exists?** ONE manual probe of the exact endpoint/path/PID BEFORE the loop. A watcher on `http://127.0.0.1:1/x` runs forever and observes nothing.
- [ ] **Notification volume?** Single-shot condition → fires exactly once. Recurring → estimate rate; dedupe or raise threshold if it would flood the channel.
- [ ] **Interval sane?** ≥30 s remote, 0.5–1 s local.

---

## Post-Arm Verification (never trust silence)

Immediately after arming, verify the observation channel actually carries data:

1. Run the probe once manually and confirm it returns the expected in-progress
   signal ("status: running", a growing byte count, a fresh log line).
2. If the source can be safely stimulated (e.g. `logger` a marker line into
   the watched journal, touch a file in the watched dir), inject a marker and
   confirm the watcher sees it.
3. If neither is possible, at minimum confirm the watcher's own process is
   alive and its first iteration produced the expected "still waiting" output.

A watcher that has never demonstrably seen anything is unverified. Silence
after arming means "unverified", not "all quiet". **Cisza ≠ sukces.**

---

## Cleanup

- When the condition fires, or the observation is no longer needed, **stop
  the watcher**: `TaskStop` for Monitor tasks, kill/collect background Bash
  shells.
- NEVER end a task with an armed watcher unless the user explicitly asked for
  an ongoing watch — and then report its ID and how to stop it.
- An orphaned watcher is a defect, not a convenience.
