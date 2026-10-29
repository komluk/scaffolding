#!/usr/bin/env bash
# Sourceable resolver: exposes resolve_plugin_root(), implementing design D1's
# three tiers. On success, prints the resolved absolute path on stdout and
# returns 0. On failure, prints nothing on stdout, a diagnostic on stderr, and
# returns non-zero.
#
# Tiers (first hit wins):
#   1. $SCAFFOLDING_PLUGIN_ROOT if set and a directory (test/override seam)
#   2. jq -r '.plugins["scaffolding@komluk-scaffolding"][0].installPath'
#      from ~/.claude/plugins/installed_plugins.json (authoritative — what
#      Claude Code itself loads)
#   3. highest dir under the cache root by `sort -V` (warn on stderr)

resolve_plugin_root() {
  local cache_root="$HOME/.claude/plugins/cache/komluk-scaffolding/scaffolding"
  local manifest="$HOME/.claude/plugins/installed_plugins.json"
  local root=""

  # Tier 1: explicit override
  if [ -n "${SCAFFOLDING_PLUGIN_ROOT:-}" ] && [ -d "${SCAFFOLDING_PLUGIN_ROOT}" ]; then
    root="$SCAFFOLDING_PLUGIN_ROOT"
  fi

  # Tier 2: manifest (authoritative)
  if [ -z "$root" ] && [ -f "$manifest" ] && command -v jq >/dev/null 2>&1; then
    local manifest_path
    manifest_path=$(jq -r '.plugins["scaffolding@komluk-scaffolding"][0].installPath // empty' "$manifest" 2>/dev/null)
    if [ -n "$manifest_path" ] && [ -d "$manifest_path" ]; then
      root="$manifest_path"
    fi
  fi

  # Tier 3: highest version dir by sort -V (fallback, warn)
  if [ -z "$root" ] && [ -d "$cache_root" ]; then
    local highest
    highest=$(find "$cache_root" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort -V | tail -1)
    if [ -n "$highest" ]; then
      root="$cache_root/$highest"
      echo "WARNING: scaffolding-plugin-root: manifest resolution failed, falling back to highest version dir by sort -V: $root" >&2
    fi
  fi

  if [ -z "$root" ]; then
    echo "ERROR: scaffolding-plugin-root: could not resolve plugin root. Tried: SCAFFOLDING_PLUGIN_ROOT env, $manifest, $cache_root" >&2
    return 1
  fi

  if [ ! -f "$root/agents/developer.md" ]; then
    echo "ERROR: scaffolding-plugin-root: resolved root '$root' has no agents/developer.md" >&2
    return 1
  fi

  echo "$root"
  return 0
}

# Allow direct execution for a quick manual check: bash scaffolding-plugin-root.sh
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  resolve_plugin_root
fi
