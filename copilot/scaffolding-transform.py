#!/usr/bin/env python3
"""
scaffolding-transform.py — frontmatter transform for one scaffolding agent
file, per design D3/D4 (Port scaffolding agent system to GitHub Copilot CLI).

Usage:
    scaffolding-transform.py <agent-name> <source.md> <dest.md>

Transform rules (design D3/D4, tasks.md 2.1):
  - name: <agent>          -> name: scaffolding:<agent>
  - infer: true             added
  - tools, model, effort, maxTurns, disallowedTools   stripped
  - description, skills     kept verbatim
  - body                    passed through byte-for-byte
  - marker HTML comment appended immediately after the closing '---'

Writes atomically: to <dest>.tmp then os.replace() into <dest>.
"""
import sys
import os
import yaml

STRIP_KEYS = {"tools", "model", "effort", "maxTurns", "disallowedTools"}


def split_frontmatter(text):
    if not text.startswith("---\n"):
        raise ValueError("source file does not start with a YAML frontmatter block")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("source file has no closing '---' for frontmatter")
    fm_text = text[4:end]
    body = text[end + 5:]
    return fm_text, body


def main():
    if len(sys.argv) != 4:
        print("usage: scaffolding-transform.py <agent-name> <source.md> <dest.md>", file=sys.stderr)
        return 1

    agent, src_path, dest_path = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(src_path, "r", encoding="utf-8") as f:
        source_text = f.read()

    fm_text, body = split_frontmatter(source_text)
    fm = yaml.safe_load(fm_text) or {}

    if fm.get("name") != agent:
        print(
            f"WARNING: source frontmatter name={fm.get('name')!r} does not match "
            f"expected agent {agent!r}",
            file=sys.stderr,
        )

    new_fm = {}
    new_fm["name"] = f"scaffolding:{agent}"
    if "description" in fm:
        new_fm["description"] = fm["description"]
    if "skills" in fm:
        new_fm["skills"] = fm["skills"]
    new_fm["infer"] = True

    for key in STRIP_KEYS:
        if key in fm:
            pass  # explicitly stripped, not carried into new_fm

    rendered_fm = yaml.safe_dump(
        new_fm, sort_keys=False, default_flow_style=False, allow_unicode=True
    )

    marker = f"<!-- generated-by: scaffolding-copilot-sync | source: {src_path} -->\n"

    out = f"---\n{rendered_fm}---\n{marker}{body}"

    tmp_path = dest_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(out)
    os.replace(tmp_path, dest_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
