#!/usr/bin/env bash
# notify.sh — optional Stop / Notification hook.
#
# Emits a desktop/terminal notification when Claude finishes or needs attention.
# Pure no-op unless explicitly enabled and a notifier is present.
#
# Opt-in: gated behind SCAFFOLDING_NOTIFY=1 (default off — environment-dependent
# and potentially noisy, especially in headless/CI). Always exits 0.

set +e

# Opt-in gate — no-op fast-path when not enabled.
if [ "${SCAFFOLDING_NOTIFY:-}" != "1" ]; then
    exit 0
fi

MSG="Claude Code: task finished / awaiting input"

# Linux desktop notification.
if command -v notify-send >/dev/null 2>&1; then
    notify-send "Claude Code" "$MSG" >/dev/null 2>&1
# macOS notification.
elif command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$MSG\" with title \"Claude Code\"" >/dev/null 2>&1
fi

# Terminal bell as a lightweight always-available fallback (only on a TTY).
if [ -t 2 ]; then
    printf '\a' >&2 2>/dev/null
fi

exit 0
