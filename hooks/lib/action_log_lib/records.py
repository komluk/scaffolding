"""Record construction, caps and write helpers for the episodic action log.

Metadata only: a record is built from an explicit set of scalar fields plus the
allowlisted `target` (targets.py). Raw tool input / output never reaches here.
"""
import gzip
import json
import os
import re
import time

from .targets import kind_of, target_for

SCHEMA_V = 1
MAX_RECORDS = 5000
MAX_BYTES = 2 * 1024 * 1024
MAX_CONV_BYTES = 50 * 1024 * 1024
KEEP_KINDS = ("edit", "exec", "agent")

_IDENT = re.compile(r"^[A-Za-z0-9._:@-]{1,80}$")
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")


def ident(value, default=None):
    """A short identifier safe to store verbatim, else default."""
    return value if isinstance(value, str) and _IDENT.match(value) else default


def agent_name(value, default="main"):
    if isinstance(value, str):
        value = value.replace("scaffolding:", "", 1)
    return ident(value, default)


def iso_ts(value):
    """Epoch seconds (platform) or an ISO-8601 Z string (local) -> ISO string, else None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        t = time.gmtime(value)
        return time.strftime("%Y-%m-%dT%H:%M:%S", t) + ".%03dZ" % int((value % 1) * 1000)
    if isinstance(value, str) and _ISO.match(value):
        return value
    return None


def make_record(ctx, seq, tool_id, tool, inp, ts, agent, parent, status="unknown"):
    """ctx: dict(src, conv, run, repo, project_dir)."""
    tool = ident(tool, "other")
    rec = {
        "v": SCHEMA_V, "ts": ts, "src": ctx["src"], "conv": ctx["conv"], "run": ctx["run"],
        "repo": ctx["repo"], "agent": agent, "parent": parent, "seq": seq,
        "id": ident(tool_id), "tool": tool, "kind": kind_of(tool),
    }
    target = target_for(tool, inp, ctx.get("project_dir"))
    if target:
        rec["target"] = target
    rec["status"] = status
    return rec


def keep_when_capped(rec):
    return rec.get("status") == "error" or rec.get("kind") in KEEP_KINDS


def dumps(rec):
    return json.dumps(rec, ensure_ascii=False, separators=(",", ":"))


def apply_caps(records):
    """5000 records or 2 MB per run; beyond that keep only errors/edits/commands/subagents."""
    kept, size, truncated = [], 0, 0
    for rec in records:
        line_len = len(dumps(rec).encode("utf-8")) + 1
        if (len(kept) >= MAX_RECORDS or size + line_len > MAX_BYTES) and not keep_when_capped(rec):
            truncated += 1
            continue
        kept.append(rec)
        size += line_len
    return kept, truncated


def append_lines(path, lines):
    """One os.write per line on an O_APPEND fd (single-line atomic appends, NFS-safe)."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o664)
    try:
        for line in lines:
            os.write(fd, (line + "\n").encode("utf-8"))
    finally:
        os.close(fd)


def atomic_write(path, text):
    tmp = "%s.tmp.%d" % (path, os.getpid())
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def rotate(actions_dir, keep_name=None, limit=MAX_CONV_BYTES):
    """Over `limit` bytes per conversation: gzip the oldest run files (never deleted)."""
    try:
        files = [os.path.join(actions_dir, n) for n in os.listdir(actions_dir) if n.endswith((".jsonl", ".jsonl.gz"))]
        total = sum(os.path.getsize(f) for f in files)
        for f in sorted((f for f in files if f.endswith(".jsonl")), key=os.path.getmtime):
            if total <= limit:
                break
            if os.path.basename(f) == keep_name:
                continue
            before = os.path.getsize(f)
            with open(f, "rb") as src, gzip.open(f + ".gz", "wb") as dst:
                dst.write(src.read())
            os.unlink(f)
            total += os.path.getsize(f + ".gz") - before
    except OSError:
        pass
