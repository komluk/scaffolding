# Parity goldens

`golden/<hook>.json` holds, per case in `cases/*.mjs`, the exit code, stdout, stderr and resulting files of
each hook as produced by the **python3 implementation (plugin v2.34.0)**, before the port to Node.
Exception: `block-env-write`, `block-destructive-rm`, `block-force-push` and `block-subagent` were re-recorded from the
Node hooks in **v2.37.0**, when their known gaps were closed (102 intended decision changes, listed in CHANGELOG 2.37.0).
`node run.mjs compare` (run by `tests/hooks/test-parity.sh`) runs the current hooks over the same inputs, in a
fresh sandbox with a PATH that has no `python3`, and requires byte-identical results.

Re-record only for an intended, reviewed behaviour change, from a checkout whose hooks you trust:

    node tests/hooks/parity/run.mjs record --hooks /path/to/hooks      # also set PATH to include python3 if they need it

Notes: sandbox paths, task ids, dates/timestamps, git hashes and path-derived project ids are normalised.
The mtime cases avoid sub-second boundaries (GNU stat floors, uutils stat rounds).

## Helper specs (`helpers/`, `cases/crlf.mjs`)

`quote.sh`, `emit-block.sh`, `emit-block-guard.sh` wrap the one-line python snippets the hooks used to carry
(`json.dumps(sys.stdin.read())`, the `{"decision":"block",...}` emit and the `stop_hook_active` guard). They run the
python line when `--hooks` points at the pristine python hooks (no `lib/hook-io.mjs` there) and `hook-io.mjs` otherwise,
so `\r` / `\r\n` / invalid-byte inputs to `quote` and `emit-block` have python-recorded goldens.
Python's `sys.stdin.read()` on a **pipe** does not translate `\r` or `\r\n` (only a tty / `newline=None` text file
does), so neither does `hook-io.mjs`.

## Deliberate differences from the python hooks (not covered by goldens)

1. **Locale.** Invalid UTF-8 on stdin: python under `LC_ALL=C` / `C.UTF-8` / `POSIX` (and a container with no `LANG`,
   via PEP 538/540 coercion) decodes with `surrogateescape`; under `en_US.UTF-8` it raises, the helper's
   `json.load` fails and the hooks **fail open** (exit 0, no output). `hook-io.mjs` always uses the surrogateescape
   behaviour (the goldens are recorded with `LC_ALL=C.UTF-8`). That is the deliberate choice: a payload with one stray
   byte still gets its command/path/subagent inspected instead of silently allowing a `rm -rf /etc`. What was
   checked: no `LANG`/`LC_*` is set anywhere in `scaffolding.tool` `devops/session-image` or in the backend's
   `agent/isolation/env.ts` (it passes the backend env through and only sets PATH/HOME/IS_SANDBOX), so the session
   containers most likely run without a locale (python then coerces to a C.UTF-8-like surrogateescape mode); not
   verified inside a live container. A developer workstation with `LANG=en_US.UTF-8` is where the old hooks could
   fail open on a stray byte, and where the Node port now blocks.
2. **JSON nesting depth.** python's `json` raises `RecursionError` on very deep nesting (about 10k levels on 3.12,
   about 58k on 3.14) and the blocking hooks then fail open. `parseJson` is iterative and has no depth limit, so deeply
   nested padding can no longer hide a `tool_input` from a blocking hook. Not in the corpus because the python
   threshold depends on the interpreter version; covered up to depth 3000 (within every python's range) and by
   `test-hook-io.sh` at depth 100000.

## Filesystem-order-dependent behaviour (known gap, not in the goldens)

`refactor-guard` enumerates directories in raw `readdir` order, in both the python (v2.34.0) and the Node
implementation (`listdirRaw`, and the order `grep -rl` prints): the 8 newest subagent transcripts when mtimes tie,
the first 40 workspace hits (cap), and which of several defining files is named in the deny reason. That order is
filesystem-specific (ext4 hashes it, tmpfs is reverse-creation, overlayfs differs), so parity holds per filesystem but
a golden recorded on one cannot be replayed on another. Such cases are therefore not recorded; the corpus keeps only
cases with distinct mtimes and a single defining file. To check this, run the suite with `TMPDIR=/dev/shm` or a
directory on another filesystem (the runner creates its sandboxes under `$TMPDIR`).
