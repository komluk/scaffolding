#!/usr/bin/env bash
# SessionStart hook — compute a stable per-project id for memory scoping.
#
# Emits the project_id as additionalContext so agents pass it to the
# mcp__memory__* tools, isolating memory per repository (shared across
# the user's devices, since it derives from the git remote, not the local path).
#
# A committed `<repo root>/.scaffolding.json` ({"project_id": "scaffold:<16 hex>"}) pins the id and
# wins over the derivation below. Read rule (identical in every consumer): regular file, not a
# symlink, <= 4096 bytes, exactly one match of the project_id regex over its bytes (not a JSON parser).
#
# No-op-safe: if semantic memory isn't enabled, the injected note is harmless.
set -euo pipefail

pinned=""; pin_warn=""
_pinned_pid() {  # $1 = repo root; sets pinned to the id (else empty) and pin_warn when the file exists but is unusable
  local f="$1/.scaffolding.json" m
  [ -e "$f" ] || [ -L "$f" ] || return 0
  if [ -L "$f" ] || [ ! -f "$f" ] || [ "$(wc -c < "$f")" -gt 4096 ]; then
    pin_warn="ignored .scaffolding.json (symlink, not a regular file, or larger than 4096 bytes)"; return 0
  fi
  m="$(grep -oE '"project_id"[[:space:]]*:[[:space:]]*"scaffold:[0-9a-f]{16}"' "$f" 2>/dev/null || true)"
  if [ "$(printf '%s\n' "$m" | grep -c .)" = 1 ]; then
    pinned="$(printf '%s' "$m" | grep -oE 'scaffold:[0-9a-f]{16}')"
  else
    pin_warn="ignored .scaffolding.json (needs exactly one \"project_id\": \"scaffold:<16 hex>\" entry)"
  fi
}

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
remote="$(git -C "$dir" config --get remote.origin.url 2>/dev/null || true)"
# Key = lowercase "owner/repo" taken from the remote, so every clone of one repo
# (scp/ssh/https URL, any host alias or IP) gets the same id. No remote -> abs path.
slug=""
if [ -n "$remote" ]; then
  slug="$(printf '%s' "$remote" | sed -E 's#[/:]+$##; s#\.git$##; s#^.*[:/]([^/:]+/[^/:]+)$#\1#' | tr '[:upper:]' '[:lower:]')"
  case "$slug" in */*) ;; *) slug="" ;; esac
fi
key="${slug:-${remote:-$(cd "$dir" 2>/dev/null && pwd || echo "$dir")}}"

if command -v sha256sum >/dev/null 2>&1; then
  h="$(printf '%s' "$key" | sha256sum | cut -c1-16)"
else
  h="$(printf '%s' "$key" | shasum -a 256 | cut -c1-16)"
fi
pid="scaffold:${h}"

top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || echo "$dir")"
_pinned_pid "$top"
note=""
if [ -n "$pinned" ]; then
  if [ "$pinned" != "$pid" ]; then
    note=" Note: .scaffolding.json pins ${pinned}, the remote derives ${pid}; if this repo was created from a template or copied, fix the file."
  fi
  pid="$pinned"
elif [ -n "$pin_warn" ]; then
  note=" Note: ${pin_warn}; using the id derived from the remote."
fi

# Cache for other tooling.
mkdir -p "$dir/.scaffolding" 2>/dev/null || true
printf '%s\n' "$pid" > "$dir/.scaffolding/project-id" 2>/dev/null || true

ctx="memory project_id = ${pid}. When the mcp__memory__* tools are available, ALWAYS pass project_id=\"${pid}\" to semantic_search, semantic_recall, and semantic_store so memory stays isolated per project (and shared across your devices).${note}"

# SessionStart additionalContext injection (JSON-escape via node hook-io quote, with fallback).
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' \
  "$(printf '%s' "$ctx" | node "$LIB/hook-io.mjs" quote 2>/dev/null || printf '"%s"' "$ctx")"
