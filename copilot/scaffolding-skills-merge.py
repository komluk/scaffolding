#!/usr/bin/env python3
"""
scaffolding-skills-merge.py — strip stale scaffolding-cache skillDirectories
entries from ~/.copilot/settings.json before `copilot skill add` registers
the current version (design A5 / group 5, optional, non-gating).

Never touches disabledSkills or any other key. Only removes/adds entries
whose path is under the komluk-scaffolding cache root -- a user's own custom
skill directories are left untouched.

Usage:
    scaffolding-skills-merge.py <settings.json> <src-root>   # pre-add strip
    scaffolding-skills-merge.py --remove <settings.json>     # uninstall
"""
import json
import os
import sys

CACHE_ROOT_MARKER = os.path.join(
    os.path.expanduser("~"), ".claude", "plugins", "cache", "komluk-scaffolding", "scaffolding"
)


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


def strip_cache_entries(settings):
    dirs = settings.get("skillDirectories")
    if not isinstance(dirs, list):
        return False
    kept = [d for d in dirs if not str(d).startswith(CACHE_ROOT_MARKER)]
    if len(kept) == len(dirs):
        return False
    if kept:
        settings["skillDirectories"] = kept
    else:
        del settings["skillDirectories"]
    return True


def main():
    args = sys.argv[1:]
    remove_mode = False
    if args and args[0] == "--remove":
        remove_mode = True
        args = args[1:]

    if remove_mode:
        if len(args) != 1:
            print("usage: scaffolding-skills-merge.py --remove <settings.json>", file=sys.stderr)
            return 1
        settings_path = args[0]
    else:
        if len(args) != 2:
            print("usage: scaffolding-skills-merge.py <settings.json> <src-root>", file=sys.stderr)
            return 1
        settings_path = args[0]

    settings = load(settings_path)
    changed = strip_cache_entries(settings)
    if changed:
        save(settings_path, settings)
    return 0


if __name__ == "__main__":
    sys.exit(main())
