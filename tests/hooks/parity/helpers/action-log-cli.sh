#!/usr/bin/env bash
# Parity helper: the action-log CLI. AL_ARGS = newline separated words; a line `;;` separates invocations and a
# first word starting with `!` is a shell command run between them (e.g. `!cat more >> t.jsonl`). Output of all
# invocations is concatenated; the exit code is the last one's.
# Recording (HOOKS_DIR = the python hooks, no lib/action-log.mjs): `python3 -I lib/action_log.py` with its argparse
# prog renamed to action-log.mjs (so usage text, which wraps by prog length, is comparable). Comparing: node.
# Warning lines (`action_log: ...` / `action-log: ...`) carry interpreter-specific exception text: only their presence
# is compared (they go to /dev/null in the hook and to stdio:'ignore' in the backend).
run_one() {
  if [ -f "$HOOKS_DIR/lib/action-log.mjs" ]; then
    node "$HOOKS_DIR/lib/action-log.mjs" "$@"
  else
    python3 -I -c '
import argparse, sys
_init = argparse.ArgumentParser.__init__
def init(self, *a, **k):
    if k.get("prog") == "action_log.py":
        k["prog"] = "action-log.mjs"
    _init(self, *a, **k)
argparse.ArgumentParser.__init__ = init
sys.path.insert(0, sys.argv[1])
import action_log
sys.exit(action_log.main(sys.argv[2:]))' "$HOOKS_DIR/lib" "$@"
  fi
}
words=()
rc=0
errf="$(mktemp)"
flush() {
  if [ "${#words[@]}" -gt 0 ]; then
    case "${words[0]}" in
      '!'*) bash -c "${words[0]#!}" ;;
      *) run_one "${words[@]}" 2>>"$errf"; rc=$? ;;
    esac
  fi
  words=()
}
while IFS= read -r line || [ -n "$line" ]; do
  if [ "$line" = ';;' ]; then flush; else words+=("$line"); fi
done <<< "$AL_ARGS"
flush
sed -E 's/^action[_-]log: .*/action-log: <warning>/' "$errf" >&2
rm -f "$errf"
exit "$rc"
