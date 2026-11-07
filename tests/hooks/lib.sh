#!/usr/bin/env bash
# Tiny assertion helpers for the hook tests. Source this; call finish at the end.
# Tests build throwaway repos with `git -C "$T"`. An inherited GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE (exported by
# an outer git: a hook, `git rebase --exec`, `git commit` running pre-commit) overrides -C and points those
# commands at the CALLER's repository. Drop every repo-location variable git itself exports.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR \
      GIT_NAMESPACE GIT_CEILING_DIRECTORIES GIT_DISCOVERY_ACROSS_FILESYSTEM GIT_PREFIX GIT_QUARANTINE_PATH
PASS=0
FAIL=0
# shellcheck disable=SC2034  # used by the sourcing test files
HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../hooks" && pwd)"

ok()   { PASS=$((PASS + 1)); echo "  ok   - $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL - $1"; }
check() { local d="$1"; shift; if "$@"; then ok "$d"; else bad "$d"; fi; }

is_link_to() { [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; }
has_file()   { [ -f "$1" ]; }
file_is()    { [ "$(cat "$1" 2>/dev/null)" = "$2" ]; }
file_is_str() { [ "$1" = "$2" ]; }
contains()   { printf '%s' "$1" | grep -qF -- "$2"; }

mktmp() { mktemp -d "${TMPDIR:-/tmp}/scaffolding-test.XXXXXX"; }

finish() {
    echo "passed=$PASS failed=$FAIL"
    [ "$FAIL" -eq 0 ]
}
