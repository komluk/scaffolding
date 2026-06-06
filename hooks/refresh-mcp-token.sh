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
TOKEN="$token" python3 - "$SETTINGS" <<'PY' 2>/dev/null || exit 0
import json, os, sys, tempfile
path = sys.argv[1]
tok = os.environ["TOKEN"]
with open(path) as f:
    d = json.load(f)
env = d.setdefault("env", {})
if env.get("MEMORY_MCP_TOKEN") == tok:
    sys.exit(0)  # already fresh, no write
env["MEMORY_MCP_TOKEN"] = tok
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
with os.fdopen(fd, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
os.chmod(tmp, 0o600)
os.replace(tmp, path)
PY

exit 0
