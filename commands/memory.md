# /memory Command

Manage cross-device **semantic memory** for scaffolding (self-hosted mem0 + pgvector,
Ollama on GPU). Opt-in, per-device. Memory is **off by default** — nothing is wired
until you enable it.

## Usage

```
/memory enable     # wire the semantic-memory MCP backend into Claude Code (user scope)
/memory disable    # remove it from this device (stored memories on the backend are kept)
/memory status     # show whether it's wired and reachable
```

The assistant reads the argument (`enable` / `disable` / `status`; default: `status`) and
performs the matching section below.

---

## enable

Connects this device so scaffolding agents gain persistent memory via the
`semantic_search` / `semantic_recall` / `semantic_store` tools (see the
`semantic-memory-mcp` and `semantic-memory-store` skills). The token is personal —
memory is yours only; anyone without it gets 401.

1. **Check the token** is in the environment:
   ```bash
   test -n "${MEMORY_MCP_TOKEN:-}" || echo "MEMORY_MCP_TOKEN not set — export it (e.g. from Vault: export MEMORY_MCP_TOKEN=$(vault kv get -field=token kv/memory/mcp)) and re-run"
   ```
2. **Register the MCP server** (user scope; default endpoint = homelab backend, override
   with `MEMORY_MCP_URL`):
   ```bash
   claude mcp add --scope user --transport http semantic-memory \
     "${MEMORY_MCP_URL:-http://memory.bernardynska.waw.pl:8000/mcp}" \
     --header "Authorization: Bearer \${MEMORY_MCP_TOKEN}"
   ```
   (The literal `${MEMORY_MCP_TOKEN}` is stored and expanded at runtime — the token is
   never written to disk.)
3. **Verify**: `claude mcp list | grep semantic-memory`
4. **Tell the user to restart Claude Code** so the server + token load and connect. After
   restart, `mcp__semantic-memory__*` tools are available and skills use them automatically.

## disable

```bash
claude mcp remove semantic-memory --scope user
```
Then tell the user to restart Claude Code. Stored memories on the backend are **not**
deleted — re-enable any time with `/memory enable`.

## status

```bash
claude mcp list | grep -i semantic-memory || echo "memory: not enabled on this device"
```
If present, report the URL and whether `MEMORY_MCP_TOKEN` is set in the environment
(connection needs both). Note: `Failed to connect` usually just means the current shell
lacks `MEMORY_MCP_TOKEN` — it loads on the next Claude Code launch via the `claude()`
shell wrapper.

---

## Notes

- **Backend**: self-hosted mem0 (vector-only) on the homelab (LXC `memory`,
  `memory.bernardynska.waw.pl:8000`); Ollama on GPU for distillation/embeddings;
  egress-blocked at the UDM — nothing leaves the LAN.
- **Per-project isolation**: the `memory-project-id.sh` SessionStart hook injects a stable
  `project_id` (derived from the git remote) so each repo has its own memory namespace,
  shared across your devices.
- **Graceful degradation**: if the backend is unreachable, scaffolding skills fall back to
  file-based memory (`.scaffolding/agent-memory/`) — agents never block.
- **Personal**: anyone installing scaffolding without your token/endpoint simply runs
  without semantic memory.
