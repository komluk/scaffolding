#!/usr/bin/env bash
# Run every hook test; non-zero if any fails.
cd "$(dirname "${BASH_SOURCE[0]}")/hooks" || exit 1
rc=0
for t in test-*.sh; do
    echo "=== $t"
    bash "$t" || rc=1
done
exit $rc
