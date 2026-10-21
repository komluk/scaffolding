"""Allowlist-only `target` descriptors and tool kinds (metadata only).

Anything not listed returns None (target omitted). Never reads content /
old_string / new_string / prompt / tool_result bodies.
"""
import os
import re
from urllib.parse import urlsplit

from .redact import redact

KINDS = {
    "Edit": "edit", "Write": "edit", "NotebookEdit": "edit", "MultiEdit": "edit",
    "Read": "read", "Grep": "search", "Glob": "search", "Bash": "exec",
    "Task": "agent", "Agent": "agent", "WebFetch": "web", "WebSearch": "web",
}
MCP_ARGS = ("owner", "repo", "index", "pull_number", "number", "method", "state", "branch", "ref",
            "corpus", "relative_path", "project_id", "node", "vmid", "name", "path", "file_path")
_DROP_ARG = re.compile(r"token|secret|key|pass|auth|cred|content|body|text|prompt|query|data", re.I)
_ENV_PREFIX = re.compile(r"^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+")
_ENV_NAME = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)=\S*")


def kind_of(tool):
    if tool in KINDS:
        return KINDS[tool]
    return "mcp" if isinstance(tool, str) and tool.startswith("mcp__") else "other"


def _clip(text, n):
    return text if len(text) <= n else text[:n]


def _scalar(v):
    return isinstance(v, (str, int, float)) and not isinstance(v, bool) or isinstance(v, bool)


def _path(p, project_dir):
    if not isinstance(p, str) or not p:
        return None
    if project_dir and (p == project_dir or p.startswith(project_dir.rstrip("/") + "/")):
        p = os.path.relpath(p, project_dir)
    else:
        home = os.path.expanduser("~")
        if home and home != "/" and (p == home or p.startswith(home + "/")):
            p = "~" + p[len(home):]
    return p


def _bash(inp):
    cmd = inp.get("command")
    if not isinstance(cmd, str):
        return None
    line = cmd.strip().split("\n", 1)[0]
    line = re.split(r"<<|\|\s*base64", line, maxsplit=1)[0].rstrip()
    m = _ENV_PREFIX.match(line)
    if m:
        line = _ENV_NAME.sub(lambda x: x.group(1) + "=***", m.group(0)) + line[m.end():]
    out = _clip(redact(line), 80)
    desc = inp.get("description")
    if isinstance(desc, str) and desc.strip():
        out += " — " + _clip(redact(desc.strip().split("\n", 1)[0]), 60)
    return out


def _mcp(tool, inp):
    short = tool.split("__", 2)[-1]
    parts = [short]
    for name in MCP_ARGS:
        if name in inp and not _DROP_ARG.search(name):
            v = inp[name]
            if _scalar(v):
                parts.append("%s=%s" % (name, _clip(redact(str(v)), 60)))
    return " ".join(parts)


def _web(inp):
    url = inp.get("url")
    if not isinstance(url, str):
        return None
    u = urlsplit(url)
    host = u.hostname or ""
    if u.port:
        host += ":%d" % u.port
    return "%s://%s%s" % (u.scheme, host, u.path) if u.scheme and host else None


def target_for(tool, inp, project_dir=None):
    """Return a <=120 char redacted descriptor, or None. Never raises."""
    try:
        if not isinstance(inp, dict):
            return None
        kind = kind_of(tool)
        t = None
        if tool in ("Edit", "Write", "NotebookEdit", "MultiEdit", "Read"):
            t = _path(inp.get("file_path") or inp.get("notebook_path"), project_dir)
        elif tool == "Bash":
            t = _bash(inp)
        elif tool in ("Grep", "Glob"):
            pat = inp.get("pattern")
            if isinstance(pat, str):
                t = _clip(pat, 60)
                if isinstance(inp.get("path"), str):
                    t += " in " + (_path(inp["path"], project_dir) or "")
        elif tool in ("Task", "Agent"):
            st = inp.get("subagent_type")
            if isinstance(st, str):
                t = st.replace("scaffolding:", "", 1)
                if isinstance(inp.get("description"), str):
                    t += ": " + _clip(inp["description"], 80)
        elif tool == "WebFetch":
            t = _web(inp)
        elif tool == "WebSearch":
            if isinstance(inp.get("query"), str):
                t = _clip(inp["query"], 60)
        elif kind == "mcp":
            t = _mcp(tool, inp)
        return _clip(redact(t), 120) if t else None
    except Exception:  # noqa: BLE001 - fail open on the run, omit the target
        return None
