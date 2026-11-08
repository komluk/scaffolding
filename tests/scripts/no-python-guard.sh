#!/usr/bin/env bash
# no-python-guard.sh — the plugin has no Python: fails when a Python file is tracked or a script/command/skill runs python.
#
# Usage: tests/scripts/no-python-guard.sh [repo-root]        (default: the repo this script lives in)
#
# Checks (exit 1 on any hit):
#   1. no tracked *.py / *.pyc / *.pyi file and no __pycache__ directory
#   2. no python/python3 INVOCATION under hooks/ tests/ scripts/ validators/ copilot/ .github/ commands/ and the skills that
#      carry runnable snippets. An invocation is `python` / `python3` as a command word (start of line, after whitespace, `;`, `&`,
#      `|`, `(`, `$(`, a backtick or a quote), or a quoted 'python3' argument of spawn/exec. Lines that are comments (`#`, `//`)
#      are not scanned: prose about what the python version did is fine.
#   3. no `actions/setup-python`, `pip install` or `pyyaml` in CI workflows and docs of the repo's own tooling
# tests/hooks/parity/golden/ is recorded data (test names mention python) and is not scanned.
# Exceptions live in .github/no-python-allowlist: `path-prefix:reason`, one per line, `#` comments. A prefix that matches no
# hit is itself an error (stale entry), so the list cannot rot.
# Content that talks ABOUT python for the user's projects (skills/python-patterns, docker-templates, lspServers) is out of scope.
set -u
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" || exit 2
ALLOW=".github/no-python-allowlist"
SCAN=(hooks tests scripts validators copilot .github commands skills/sofa-search skills/spec-workflow skills/ui-ux-pro-max)

fail=0
hits="$(mktemp)"
trap 'rm -f "$hits"' EXIT

# 1. files
if git rev-parse --git-dir >/dev/null 2>&1; then
    # --cached lists the index; a file deleted in the working tree but not yet committed is not a hit
    while IFS= read -r -d '' f; do [ -e "$f" ] && printf '%s: tracked python file\n' "$f" >>"$hits"; done \
        < <(git ls-files -z -- '*.py' '*.pyc' '*.pyi' '*/__pycache__/*')
fi
find . -name __pycache__ -not -path './.git/*' -not -path './node_modules/*' | sed 's|^\./||; s/$/: __pycache__ directory/' >>"$hits"

# 2. invocations (comments skipped)
# an invocation: python as a command word (line start, after ; & | { $( or a backtick, optionally behind VAR=value prefixes),
# python/python3 followed by an option, `-` or a heredoc, a .py script, or the usual "is it installed" probes
ASSIGN='([A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]*)[[:space:]]+)*'
cmd="(^|[;&|{\`]|\\\$\\()[[:space:]]*${ASSIGN}python3?([[:space:]]|\$)"
cmd2="python3?[[:space:]]+(-[A-Za-z]|-[[:space:]]|<<|[^[:space:]]*\\.py)"
cmd3="(command -v|which|type|exec|sudo|apt install|apt-get install|brew install)[[:space:]]+python3?([[:space:]]|\$)"
spawn="(spawn|exec)[A-Za-z]*\\([[:space:]]*['\"\`]python3?['\"\`]"
SHELLISH=(--include='*.sh' --include='*.tmpl' --include='*.md' --include='*.yml' --include='*.yaml' --include='*.json' --include='*.txt')
SCRIPTS=(--include='*.mjs' --include='*.js' --include='*.cjs' --include='*.ts')
NOTCOMMENT='^[^:]+:[0-9]+:[[:space:]]*(#|//|\*|/\*|<!--)'
for d in "${SCAN[@]}"; do
    [ -e "$d" ] || continue
    {
        # command words in shell, markdown snippets and workflows (a `//` comment line in a .mjs is prose, not scanned there)
        grep -rnIE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=golden "${SHELLISH[@]}" -e "$cmd" -e "$cmd2" -e "$cmd3" "$d"
        # a process spawned from node
        grep -rnIE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=golden "${SCRIPTS[@]}" -e "$spawn" "$d"
        # python tooling in CI / docs
        grep -rnIE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=golden "${SHELLISH[@]}" -e 'actions/setup-python|pip3? install|pyyaml|PyYAML' "$d"
    } 2>/dev/null | grep -vE "$NOTCOMMENT" | grep -v "^tests/scripts/no-python-guard.sh:" >>"$hits"
done

# apply the allowlist
declare -A used=()
if [ -f "$ALLOW" ]; then
    mapfile -t prefixes < <(sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d' -e 's/:.*//' "$ALLOW")
else
    prefixes=()
fi
remaining="$(mktemp)"
trap 'rm -f "$hits" "$remaining"' EXIT
while IFS= read -r line; do
    [ -n "$line" ] || continue
    path="${line%%:*}"
    ok=0
    for p in "${prefixes[@]}"; do
        case "$path" in "$p"*) ok=1; used["$p"]=1; break ;; esac
    done
    [ "$ok" = 1 ] || printf '%s\n' "$line" >>"$remaining"
done < <(sort -u "$hits")

if [ -s "$remaining" ]; then
    echo "no-python-guard: python found (fix it, or add a reasoned entry to $ALLOW):"
    sed 's/^/  /' "$remaining"
    fail=1
fi
for p in "${prefixes[@]}"; do
    if [ -z "${used[$p]:-}" ]; then
        echo "no-python-guard: stale allowlist entry (matches nothing): $p"
        fail=1
    fi
done
[ "$fail" = 0 ] && echo "no-python-guard: ok (allowlist entries in use: ${#used[@]})"
exit "$fail"
