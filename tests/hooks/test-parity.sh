#!/usr/bin/env bash
# Golden-output parity for the hooks ported from python3 to node (hooks/lib/hook-io.mjs, staleness.mjs).
# tests/hooks/parity/golden/*.json was recorded from the python implementation (v2.34.0) before the port;
# every case compares exit code, stdout, stderr and resulting files byte for byte. The runner gives the hooks
# a PATH without python3, so a pass also proves they no longer need it.
# Re-record (only when a behaviour change is intended and reviewed): see tests/hooks/parity/README.md.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if ! command -v node >/dev/null 2>&1; then
    bad "node is required (>=22) for the parity runner"
    finish
    exit
fi

# goldens record file modes, recorded under umask 0002: pin it so CI runners (umask 022) compare the same
out="$(umask 0002; HOOKS_DIR="$HOOKS_DIR" node "$(dirname "${BASH_SOURCE[0]}")/parity/run.mjs" compare 2>&1)"
rc=$?
printf '%s\n' "$out" | grep -E '^(#|  FAIL|         |passed=)'
summary="$(printf '%s\n' "$out" | grep -E '^passed=[0-9]+ failed=[0-9]+$' | tail -1)"
n_ok="${summary#passed=}"; n_ok="${n_ok%% *}"
n_bad="${summary##*failed=}"
check "runner finished" test -n "$summary"
check "every golden case identical (exit code, stdout, stderr, files)" test "$rc" = 0 -a "${n_bad:-1}" = 0
check "corpus is not empty (>= 600 cases)" test "${n_ok:-0}" -ge 600
finish
