#!/usr/bin/env bash
# memory-project-id.sh: id = sha256("owner/repo" lowercased)[:16], the same for every clone URL form.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
HOOK="$HOOKS_DIR/memory-project-id.sh"
want="scaffold:$(printf '%s' 'komluk/scaffolding.tool' | sha256sum | cut -c1-16)"

id_for() {
    local d="$T/r$RANDOM"
    mkdir -p "$d" && git -C "$d" init -q
    [ -n "$1" ] && git -C "$d" remote add origin "$1"
    CLAUDE_PROJECT_DIR="$d" bash "$HOOK" >/dev/null 2>&1
    cat "$d/.scaffolding/project-id"
}

echo "# same id for every URL form of one repo"
for u in "git@10.0.0.1:komluk/scaffolding.tool.git" "git@gitea.example:komluk/scaffolding.tool" \
         "ssh://git@gitea.example:22/Komluk/Scaffolding.Tool.git" "https://gitea.example/komluk/scaffolding.tool.git/"; do
    check "$u" file_is_str "$(id_for "$u")" "$want"
done

echo "# different repos differ"
check "other repo" test "$(id_for git@x:komluk/homelab.git)" != "$want"

echo "# no remote falls back to the path (stable, not empty)"
got="$(id_for "")"
check "no remote -> scaffold:<16 hex>" contains "$got" "scaffold:"

finish
