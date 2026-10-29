#!/usr/bin/env python3
"""
scaffolding-hook-merge.py — idempotently merge (or remove) the scaffolding
PreToolUse hook entry into a repo's .claude/settings.json, per design D2
(post-Task-0 authoritative shape, V15-V18).

Never clobbers existing keys/hooks (e.g. PreCompact, SessionStart already
present). Merge target shape:

  {"hooks": {"PreToolUse": [{"matcher": "Bash",
                             "hooks": [{"type": "command",
                                        "command": "<wrapper>",
                                        "timeout": 120}]}]}}

Usage:
    scaffolding-hook-merge.py <settings.json> <wrapper-abs-path>
    scaffolding-hook-merge.py --remove <settings.json> <wrapper-abs-path>
"""
import json
import os
import sys


def load(path):
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def merge(settings, wrapper):
    hooks = settings.setdefault("hooks", {})
    entries = hooks.setdefault("PreToolUse", [])
    if not isinstance(entries, list):
        raise ValueError("hooks.PreToolUse is not an array — refusing to clobber")

    for entry in entries:
        if entry.get("matcher") == "Bash":
            inner = entry.setdefault("hooks", [])
            if any(h.get("command") == wrapper for h in inner):
                return False  # already present, idempotent no-op
            inner.append({"type": "command", "command": wrapper, "timeout": 120})
            return True

    entries.append(
        {
            "matcher": "Bash",
            "hooks": [{"type": "command", "command": wrapper, "timeout": 120}],
        }
    )
    return True


def remove(settings, wrapper):
    hooks = settings.get("hooks", {})
    entries = hooks.get("PreToolUse")
    if not isinstance(entries, list):
        return False

    changed = False
    kept_entries = []
    for entry in entries:
        if entry.get("matcher") == "Bash":
            inner = entry.get("hooks", [])
            new_inner = [h for h in inner if h.get("command") != wrapper]
            if len(new_inner) != len(inner):
                changed = True
            if new_inner:
                entry["hooks"] = new_inner
                kept_entries.append(entry)
            # else: drop the whole matcher entry, it's now empty
        else:
            kept_entries.append(entry)

    if changed:
        hooks["PreToolUse"] = kept_entries
        if not kept_entries:
            del hooks["PreToolUse"]
    return changed


def main():
    args = sys.argv[1:]
    remove_mode = False
    if args and args[0] == "--remove":
        remove_mode = True
        args = args[1:]

    if len(args) != 2:
        print(
            "usage: scaffolding-hook-merge.py [--remove] <settings.json> <wrapper-abs-path>",
            file=sys.stderr,
        )
        return 1

    settings_path, wrapper = args
    settings = load(settings_path)

    if remove_mode:
        changed = remove(settings, wrapper)
    else:
        changed = merge(settings, wrapper)

    if changed:
        save(settings_path, settings)
    return 0


if __name__ == "__main__":
    sys.exit(main())
