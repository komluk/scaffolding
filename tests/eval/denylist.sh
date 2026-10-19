#!/usr/bin/env bash
# Public-repo guard: exit 3 and print matching lines if any file leaks infra/private names.
# Usage: denylist.sh FILE...
RE='\b10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|\b172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.|\b192\.168\.'
RE+='|\b100\.6[4-9]\.|\b100\.[7-9][0-9]\.|\b100\.1[01][0-9]\.|\b100\.12[0-7]\.'
RE+='|komluk|\bCT ?[0-9]+|\bVM ?[0-9]+|kv/|\.lan\b|pve|vault'
[ "$#" -gt 0 ] || { echo "usage: $0 FILE..." >&2; exit 2; }
if grep -nEi -- "$RE" "$@"; then
    echo "denylist: matches above must not be committed to the public repo" >&2
    exit 3
fi
