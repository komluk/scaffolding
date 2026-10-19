#!/usr/bin/env bash
# Offline checks for tests/eval: denylist trips on planted infra names; the real golden set passes.
# shellcheck source=lib.sh
# shellcheck source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

EVAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../eval" && pwd)"
T="$(mktmp)"
trap 'rm -rf "$T"' EXIT
rc() { "$@" >/dev/null 2>&1; echo $?; }
plant() { printf '{"prompt":"%s","expected_agent":"scaffolding:devops","expected_difficulty":null}\n' "$1" >"$T/p.jsonl"; }

echo "# real set"
check "denylist passes on routing.jsonl" test "$(rc bash "$EVAL/denylist.sh" "$EVAL/routing.jsonl")" = 0
check "run-routing --dry-run passes" test "$(rc bash "$EVAL/run-routing.sh" --dry-run)" = 0

echo "# planted leaks trip exit 3"
for s in "ssh into CT130" "restart VM 101" "ping 10.0.5.7" "host 192.168.1.20" "node 172.16.4.2" \
         "peer 100.100.1.1" "read kv/app/key" "host box.lan" "login to pve" "unseal vault" "ask komluk"; do
    plant "$s"
    check "trips: $s" test "$(rc bash "$EVAL/denylist.sh" "$T/p.jsonl")" = 3
done
plant "ssh into CT130"
check "run-routing refuses planted set (exit 3)" test "$(rc bash "$EVAL/run-routing.sh" --dry-run --path "$T/p.jsonl")" = 3
plant "set up a pipeline"
check "clean custom set passes" test "$(rc bash "$EVAL/run-routing.sh" --dry-run --path "$T/p.jsonl")" = 0

echo "# schema errors are rejected"
echo '{"prompt":"x","expected_agent":"developer"}' >"$T/p.jsonl"
check "bad schema exit 1" test "$(rc bash "$EVAL/run-routing.sh" --dry-run --path "$T/p.jsonl")" = 1

finish
