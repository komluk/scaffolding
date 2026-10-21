"""Deterministic per-conversation timeline.md from actions/*.jsonl (no LLM).

Redaction pass #2 runs over every rendered line. Output is capped at 200 lines.
"""
import glob
import gzip
import json
import os
import re
from collections import Counter

from .records import atomic_write
from .redact import redact

MAX_LINES = 200
FULL_RUNS = 10
_NORM = re.compile(r"\b\d+\b|\b[0-9a-f]{7,40}\b", re.I)


def _read(path):
    opener = gzip.open if path.endswith(".gz") else open
    try:
        with opener(path, "rt", encoding="utf-8") as fh:
            for line in fh:
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if isinstance(obj, dict):
                    yield obj
    except (OSError, EOFError):
        return


def load_runs(conv_dir):
    runs = []
    for p in sorted(glob.glob(os.path.join(conv_dir, "actions", "*.jsonl*"))):
        if os.path.basename(p).startswith("."):
            continue
        recs = [o for o in _read(p) if not o.get("end")]
        foot = next((o for o in _read(p) if o.get("end")), {})
        if recs:
            runs.append({"run": recs[0].get("run") or os.path.basename(p), "recs": recs,
                         "status": foot.get("status", "unknown")})
    runs.sort(key=lambda r: r["recs"][0].get("ts") or "")
    return runs


def _tgt(r):
    return r.get("target") or r.get("tool") or "?"


def _norm(r):
    return (r.get("tool"), _NORM.sub("N", _tgt(r)))


def repeated(recs):
    c = Counter(_norm(r) for r in recs if r.get("status") == "error")
    return {k: n for k, n in c.items() if n >= 2}


def _uniq(items, cap):
    seen, out = set(), []
    for i in items:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out[:cap], max(0, len(out) - cap)


def _span(recs):
    ts = [r["ts"] for r in recs if r.get("ts")]
    return (min(ts), max(ts)) if ts else ("?", "?")


def _hm(ts):
    return ts[11:16] if ts and ts != "?" else "?"


def _section(run):
    recs, lo, hi = run["recs"], *_span(run["recs"])
    errs = [r for r in recs if r.get("status") == "error"]
    agents = sorted({r.get("agent") or "main" for r in recs})
    out = ["## Run %s — %s — %s %s–%s — %s (%d calls, %d errors)" % (
        str(run["run"])[:8], ", ".join(agents), lo[:10], _hm(lo), _hm(hi), run["status"], len(recs), len(errs))]
    kinds = Counter(r.get("kind") for r in recs)
    out.append("- calls by kind: " + ", ".join("%s %d" % (k, n) for k, n in sorted(kinds.items(), key=lambda x: str(x[0]))))
    edited, more = _uniq([_tgt(r) for r in recs if r.get("kind") == "edit"], 30)
    out.append("- files edited: " + (", ".join(edited) + (" (+%d)" % more if more else "") if edited else "—"))
    reads = Counter(_tgt(r) for r in recs if r.get("kind") == "read")
    out.append("- files read: %d (top: %s)" % (sum(reads.values()), ", ".join(p for p, _ in reads.most_common(10)) or "—"))
    cmds, more = _uniq([_tgt(r) for r in recs if r.get("kind") == "exec"], 20)
    out.append("- commands: " + (" ; ".join(cmds) + (" (+%d)" % more if more else "") if cmds else "—"))
    mcp, more = _uniq([_tgt(r) for r in recs if r.get("kind") == "mcp"], 15)
    out.append("- mcp: " + (" ; ".join(mcp) + (" (+%d)" % more if more else "") if mcp else "—"))
    subs, _ = _uniq([_tgt(r) for r in recs if r.get("kind") == "agent"], 10)
    out.append("- subagents: " + ("; ".join(subs) if subs else "—"))
    out.append("- errors: " + ("; ".join("%s %s %s" % (_hm(r.get("ts")), r.get("tool"), _tgt(r)) for r in errs[:20]) if errs else "—"))
    rep = repeated(recs)
    out.append("- repeated failures: " + ("; ".join("%s %s ×%d" % (k[0], k[1], n) for k, n in sorted(rep.items())) if rep else "—"))
    return out


def render_text(conv_dir):
    runs = load_runs(conv_dir)
    if not runs:
        return None
    allrecs = [r for run in runs for r in run["recs"]]
    lo, hi = min(_span(r["recs"])[0] for r in runs), max(_span(r["recs"])[1] for r in runs)
    errors = sum(1 for r in allrecs if r.get("status") == "error")
    repo = allrecs[0].get("repo", "unknown")
    lines = ["# Action timeline — %s — conversation %s" % (repo, os.path.basename(os.path.normpath(conv_dir))),
             "runs: %d · %s %s → %s %s UTC · calls %d · errors %d" % (
                 len(runs), lo[:10], _hm(lo), hi[:10], _hm(hi), len(allrecs), errors)]
    agg = Counter()
    for run in runs:
        agg.update(repeated(run["recs"]))
    if agg:
        lines.append("repeated failures (all runs): " + "; ".join("%s %s ×%d" % (k[0], k[1], n) for k, n in sorted(agg.items())[:10]))
    lines.append("")
    recent, older = runs[-FULL_RUNS:], runs[:-FULL_RUNS]
    for run in older:
        lo_, hi_ = _span(run["recs"])
        lines.append("- run %s %s %s — %d calls, %d errors" % (
            str(run["run"])[:8], lo_[:10], run["status"], len(run["recs"]),
            sum(1 for r in run["recs"] if r.get("status") == "error")))
    if older:
        lines.append("")
    for run in reversed(recent):
        lines.extend(_section(run))
        lines.append("")
    lines = [redact(ln) for ln in lines]
    if len(lines) > MAX_LINES:
        lines = lines[:MAX_LINES - 1] + ["… truncated at %d lines" % MAX_LINES]
    return "\n".join(lines).rstrip() + "\n"


def render(conv_dir):
    """Write conversations/<conv>/timeline.md atomically. Returns (path, calls, errors) or None."""
    text = render_text(conv_dir)
    if text is None:
        return None
    path = os.path.join(conv_dir, "timeline.md")
    atomic_write(path, text)
    runs = load_runs(conv_dir)
    recs = [r for run in runs for r in run["recs"]]
    return path, len(recs), sum(1 for r in recs if r.get("status") == "error")
