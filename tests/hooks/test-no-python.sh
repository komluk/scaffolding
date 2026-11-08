#!/usr/bin/env bash
# The plugin has no Python: runs tests/scripts/no-python-guard.sh (also a CI job) and checks that it still catches what it
# should, on a scratch copy of the tree.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

REPO="$(cd "$HOOKS_DIR/.." && pwd)"
GUARD="$REPO/tests/scripts/no-python-guard.sh"

check "the repo is clean" bash "$GUARD" "$REPO"

T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/hooks" "$T/tests/scripts" "$T/.github"
git -C "$T" init -q . 2>/dev/null
# the fixtures are assembled from $P so this file itself holds no literal invocation (the guard scans tests/)
P="pyth""on"
guard() { bash "$GUARD" "$T" 2>&1; }

printf '#!/usr/bin/env bash\n# python3 is only mentioned here\necho "python3 in prose"\n' > "$T/hooks/ok.sh"
check "comments and prose are fine" bash "$GUARD" "$T"

printf 'print(1)\n' > "$T/hooks/evil.py"; git -C "$T" add hooks/evil.py
check "a tracked .py file fails" bash -c "! bash '$GUARD' '$T' >/dev/null 2>&1"
git -C "$T" rm -qf hooks/evil.py 2>/dev/null; rm -f "$T/hooks/evil.py"

for line in "${P}3 -c x" "FOO=1 ${P}3 x" "echo a | ${P}3 -" "x=\$(${P}3 --version)" "if $P -m json.tool f; then :; fi"; do
    printf '#!/usr/bin/env bash\n%s\n' "$line" > "$T/hooks/evil.sh"
    check "invocation fails: $line" bash -c "! bash '$GUARD' '$T' >/dev/null 2>&1"
done
rm -f "$T/hooks/evil.sh"

printf 'spawnSync("%s3", ["x"]);\n' "$P" > "$T/hooks/evil.mjs"
check "python spawned from node fails" bash -c "! bash '$GUARD' '$T' >/dev/null 2>&1"
rm -f "$T/hooks/evil.mjs"

printf 'steps:\n  - uses: actions/setup-%s@v5\n' "$P" > "$T/.github/w.yml"
check "setup-python in a workflow fails" bash -c "! bash '$GUARD' '$T' >/dev/null 2>&1"
rm -f "$T/.github/w.yml"

mkdir -p "$T/hooks/__pycache__"; touch "$T/hooks/__pycache__/x.pyc"
check "__pycache__ fails" bash -c "! bash '$GUARD' '$T' >/dev/null 2>&1"
rm -rf "$T/hooks/__pycache__"

printf '%s3 -c x\n' "$P" > "$T/tests/scripts/rec.sh"
printf 'tests/scripts/:recording needs the original\n' > "$T/.github/no-python-allowlist"
check "an allowlisted path passes" bash "$GUARD" "$T"
printf 'tests/scripts/:recording needs the original\nnowhere/:stale\n' > "$T/.github/no-python-allowlist"
check "a stale allowlist entry fails" bash -c "! bash '$GUARD' '$T' >/dev/null 2>&1"
check "the stale entry is named" contains "$(guard)" "stale allowlist entry"

finish
