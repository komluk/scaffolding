#!/usr/bin/env bash
# pre-commit-validation: skips when only .github/.gitea files are staged; otherwise still validates.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
HOOK="$HOOKS_DIR/pre-commit-validation.sh"
SKIP_MSG="[skip] only .github/.gitea changes staged -- skipping validation"
[ "${1:-}" = --inner ] && INNER=1 || INNER=0
T=$(mktmp); trap 'rm -rf "$T"' EXIT

git -C "$T" init -q
git -C "$T" config user.email t@t
git -C "$T" config user.name t
# Failing validation entrypoint (./gradlew is detected by the hook; unlike make it needs no installed tool).
printf '#!/bin/sh\nexit 1\n' > "$T/gradlew"
chmod +x "$T/gradlew"
mkdir -p "$T/.github/workflows" "$T/.gitea/workflows"
echo 'on: push' > "$T/.github/workflows/x.yml"
echo 'on: push' > "$T/.gitea/workflows/y.yml"
echo 'services: {}' > "$T/docker-compose.yml"
echo '# readme' > "$T/README.md"
git -C "$T" add -A
git -C "$T" commit -qm init

run() { (cd "$T" && echo '{}' | bash "$HOOK" 2>&1); }
reset() { git -C "$T" reset -q --hard; git -C "$T" clean -qfd -e gradlew; }

echo "# skip"
git -C "$T" rm -q .github/workflows/x.yml
out=$(run); rc=$?
check "deleting only .github/workflows/x.yml -> exit 0" test "$rc" -eq 0
check "deletion prints skip message" contains "$out" "$SKIP_MSG"
reset
echo 'changed' >> "$T/.gitea/workflows/y.yml"
git -C "$T" add .gitea/workflows/y.yml
out=$(run); rc=$?
check "changing only .gitea/workflows/y.yml -> exit 0" test "$rc" -eq 0
check ".gitea change prints skip message" contains "$out" "$SKIP_MSG"
reset

echo "# validates"
echo 'changed' >> "$T/docker-compose.yml"
git -C "$T" add docker-compose.yml
out=$(run); rc=$?
check "only root docker-compose.yml -> exit 1" test "$rc" -eq 1
check "docker-compose.yml runs validation" contains "$out" "[gradle] running"
reset
echo 'changed' >> "$T/README.md"
git -C "$T" add README.md
out=$(run); rc=$?
check "only README.md -> exit 1" test "$rc" -eq 1
check "README.md runs validation" contains "$out" "[gradle] running"
reset
echo '# doc' >> "$T/README.md"
echo 'x' > "$T/app.js"
git -C "$T" add README.md app.js
out=$(run); rc=$?
check ".md + .js staged -> exit 1" test "$rc" -eq 1
reset
out=$(run); rc=$?
check "nothing staged -> validation runs, exit 1" test "$rc" -eq 1

echo "# local git config opt-out"
CFG_MSG="[skip] local validation disabled for this repo (git config scaffolding.precommitValidation=false)"
echo 'changed' >> "$T/README.md"
git -C "$T" add README.md
git -C "$T" config scaffolding.precommitValidation false
out=$(run); rc=$?
check "config false -> exit 0" test "$rc" -eq 0
check "config false prints skip message" contains "$out" "$CFG_MSG"
git -C "$T" config scaffolding.precommitValidation true
out=$(run); rc=$?
check "config other value -> validation runs, exit 1" test "$rc" -eq 1
check "config other value runs validation" contains "$out" "[gradle] running"
git -C "$T" config --unset scaffolding.precommitValidation
out=$(run); rc=$?
check "config unset -> validation runs, exit 1" test "$rc" -eq 1
reset

[ "$INNER" = 1 ] && { finish; exit; }
echo "# isolation: git env exported by an outer git (hook, rebase --exec) must not leak into the sandbox"
# A throwaway outer repo stands in for the caller's checkout; lib.sh unsets the GIT_* location variables.
O=$(mktmp); git -C "$O" init -q; echo keep >"$O/keep.txt"; git -C "$O" add keep.txt
out=$(GIT_DIR="$O/.git" GIT_WORK_TREE="$O" GIT_INDEX_FILE="$O/.git/index" bash "$0" --inner 2>&1)
check "suite passes with an outer GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE" contains "$out" "failed=0"
check "outer repo index untouched" test "$(git -C "$O" diff --cached --name-only)" = keep.txt
check "outer repo has no commit" test -z "$(git -C "$O" rev-parse -q --verify HEAD)"
rm -rf "$O"

finish
