#!/usr/bin/env bash
# Guards that the worktree hooks are registered where Claude Code reads plugin hooks
# (.claude-plugin/plugin.json), exactly once, and NOT in the plugin settings.json
# (a plugin's settings.json is only read for `agent`/`subagentStatusLine`).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
ROOT="$(cd "$HOOKS_DIR/.." && pwd)"
PJ="$ROOT/.claude-plugin/plugin.json"
SJ="$ROOT/settings.json"

count() { jq --arg e "$1" --arg s "$2" '[.hooks[$e][]?.hooks[]?.command | select(endswith($s))] | length' "$3"; }

for pair in "WorktreeCreate:worktree-create.sh" "WorktreeRemove:worktree-remove.sh"; do
    ev="${pair%%:*}"; sc="${pair##*:}"
    check "$ev registered once in plugin.json" test "$(count "$ev" "/hooks/$sc" "$PJ")" = 1
    check "$ev uses \${CLAUDE_PLUGIN_ROOT}" test "$(jq -r --arg e "$ev" '.hooks[$e][0].hooks[0].command' "$PJ")" = "\${CLAUDE_PLUGIN_ROOT}/hooks/$sc"
    check "$ev not duplicated in settings.json" test "$(jq --arg e "$ev" '.hooks[$e] // [] | length' "$SJ")" = 0
    check "$sc exists" test -f "$HOOKS_DIR/$sc"
done

finish
