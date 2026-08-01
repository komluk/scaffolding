# Troubleshooting

## Common gotchas

**`Agent type 'developer' not found`**
- Forgot `/reload-plugins` after install, OR used the bare name. Use `scaffolding:developer`.

**"Claude ignores the delegation protocol"**
- Plugin loaded but `/reload-plugins` was not run after install.

**"I installed the plugin, but nothing works in a new session"**
- Restart Claude Code entirely — the plugin cache may be stale. `/reload-plugins`
  is faster if a session is already active.
