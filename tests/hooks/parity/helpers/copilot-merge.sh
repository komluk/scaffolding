#!/usr/bin/env bash
# Parity helper: the Copilot settings mergers. CP_TOOL = hook-merge | skills-merge; CP_ARGS = newline separated arguments.
# Recording (HOOKS_DIR/../copilot holds the .py originals): python3 scaffolding-<tool>.py. Comparing: node scaffolding-<tool>.mjs.
# stderr is normalised: a python traceback and the node one-line error both become `<error>` (their text is interpreter
# specific; only "failed, wrote nothing, exit 1" is the contract), and the `.py` / `.mjs` in a usage line becomes `.EXT`.
dir="$HOOKS_DIR/../copilot"
args=()
while IFS= read -r line || [ -n "$line" ]; do args+=("$line"); done <<< "$CP_ARGS"
errf="$(mktemp)"
if [ -f "$dir/scaffolding-$CP_TOOL.mjs" ]; then
  node "$dir/scaffolding-$CP_TOOL.mjs" "${args[@]}" 2>"$errf"
else
  python3 "$dir/scaffolding-$CP_TOOL.py" "${args[@]}" 2>"$errf"
fi
rc=$?
if grep -qE '^usage: ' "$errf"; then sed -E 's/\.(py|mjs)\b/.EXT/g' "$errf" >&2
elif [ -s "$errf" ]; then echo '<error>' >&2; fi
rm -f "$errf"
exit "$rc"
