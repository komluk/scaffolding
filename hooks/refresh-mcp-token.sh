#!/usr/bin/env bash
# Optional SessionStart hook: refresh MEMORY_MCP_TOKEN in ~/.claude/settings.json from Vault.
#
# Shipped with the scaffolding plugin but NOT registered as an always-on plugin hook —
# it is installed per-device, opt-in, by `/memory enable`. Personal/homelab convenience:
# without the `vault` CLI (or a valid login) it is a clean no-op, so it is safe to ship.
#
# Limitation: env is loaded and MCP connects BEFORE this hook runs, so the refreshed
# value takes effect on the NEXT session, not the current one. This keeps settings.json
# perpetually topped-up so it (almost) never goes stale.
#
# Safety: only rewrites settings.json when Vault returns a valid, non-empty token.
# If Vault is sealed / you're logged out / network is down, the existing token is kept.

set -uo pipefail

SETTINGS="$HOME/.claude/settings.json"
VAULT_PATH="kv/memory/mcp"
VAULT_FIELD="token"

command -v vault >/dev/null 2>&1 || exit 0   # no vault CLI -> keep existing token
[ -f "$SETTINGS" ] || exit 0

token="$(vault kv get -field="$VAULT_FIELD" "$VAULT_PATH" 2>/dev/null)" || exit 0

# Reject empty / error-ish / implausibly short values (never clobber a good token).
case "$token" in
  ""|*[Ee]rror*|*denied*) exit 0 ;;
esac
[ "${#token}" -ge 16 ] || exit 0

# Update only MEMORY_MCP_TOKEN, preserving everything else; bail without writing if unchanged.
# hook-io set-env rewrites settings.json atomically (temp file, 0600, rename). Without node: keep the token.
LIB="${BASH_SOURCE[0]%/*}"; [[ "$LIB" == "${BASH_SOURCE[0]}" ]] && LIB=.; LIB="$LIB/lib"
command -v node >/dev/null 2>&1 || exit 0
TOKEN="$token" node "$LIB/hook-io.mjs" set-env "$SETTINGS" MEMORY_MCP_TOKEN TOKEN 2>/dev/null || exit 0

exit 0
