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

echo "# .scaffolding.json at the repo root pins the id (file wins, else derived)"
not_contains() { ! contains "$@"; }
PIN="scaffold:aaaaaaaaaaaaaaaa"
# repo_with <file-setup-cmd...>: new repo with origin komluk/scaffolding.tool; runs the cmd inside it; prints the dir
repo_with() {
    local d="$T/p$RANDOM"
    mkdir -p "$d" && git -C "$d" init -q && git -C "$d" remote add origin git@x:komluk/scaffolding.tool.git
    (cd "$d" && eval "$1")
    printf '%s' "$d"
}
run_hook() { CLAUDE_PROJECT_DIR="${2:-$1}" bash "$HOOK" 2>/dev/null; }
cached() { cat "$1/.scaffolding/project-id"; }

d="$(repo_with "printf '{\"project_id\": \"$PIN\"}\n' > .scaffolding.json")"
out="$(run_hook "$d")"
check "valid file wins: cache" file_is_str "$(cached "$d")" "$PIN"
check "valid file wins: injected" contains "$out" "project_id = $PIN."
check "valid file != derived: mismatch note" contains "$out" "pins $PIN, the remote derives $want"

d="$(repo_with "printf '{\"project_id\":\"$want\"}\n' > .scaffolding.json")"
out="$(run_hook "$d")"
check "file == derived: id kept" file_is_str "$(cached "$d")" "$want"
check "file == derived: no note" not_contains "$out" "Note:"

d="$(repo_with "printf '{\n  \"extra\": 1,\n  \"project_id\" :\t\"$PIN\"\n}\n' > .scaffolding.json")"
run_hook "$d" >/dev/null
check "whitespace around colon + other keys" file_is_str "$(cached "$d")" "$PIN"

d="$(repo_with "mkdir sub/deep -p; printf '{\"project_id\": \"$PIN\"}\n' > .scaffolding.json")"
run_hook "$d" "$d/sub/deep" >/dev/null
check "subdir cwd reads the repo-root file" file_is_str "$(cached "$d/sub/deep")" "$PIN"

d="$(repo_with ":")"
out="$(run_hook "$d")"
check "missing file -> derived" file_is_str "$(cached "$d")" "$want"
check "missing file -> no note" not_contains "$out" "Note:"

echo "# unusable file -> derived id + one-line note"
for c in \
  "two matches|printf '{\"project_id\": \"$PIN\"}\n{\"project_id\": \"scaffold:bbbbbbbbbbbbbbbb\"}\n' > .scaffolding.json" \
  "zero matches|printf '{\"other\": 1}\n' > .scaffolding.json" \
  "uppercase hex|printf '{\"project_id\": \"scaffold:AAAAAAAAAAAAAAAA\"}\n' > .scaffolding.json" \
  "15 hex|printf '{\"project_id\": \"scaffold:aaaaaaaaaaaaaaa\"}\n' > .scaffolding.json" \
  "17 hex|printf '{\"project_id\": \"scaffold:aaaaaaaaaaaaaaaaa\"}\n' > .scaffolding.json" \
  "symlink|printf '{\"project_id\": \"$PIN\"}\n' > real.json; ln -s real.json .scaffolding.json" \
  "oversize|{ printf '{\"project_id\": \"$PIN\", \"pad\": \"'; head -c 5000 /dev/zero | tr '\\0' x; printf '\"}\n'; } > .scaffolding.json" \
  "directory|mkdir .scaffolding.json"; do
    name="${c%%|*}"; d="$(repo_with "${c#*|}")"
    out="$(run_hook "$d")"
    check "$name: derived id" file_is_str "$(cached "$d")" "$want"
    check "$name: note" contains "$out" "Note: ignored .scaffolding.json"
done

finish
