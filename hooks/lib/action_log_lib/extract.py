"""Input adapters: platform output.jsonl and local CLI transcripts -> metadata records.

Metadata only. `tool_result.content` is NEVER read: status comes from `success`
(platform) or `is_error` (local) and nothing else. Malformed lines are skipped.
"""
import glob
import json
import os

from .records import (agent_name, append_lines, apply_caps, dumps, ident, iso_ts, keep_when_capped,
                      make_record, MAX_BYTES, MAX_RECORDS)

LOCAL_BUDGET = 10 * 1024 * 1024


def repo_and_project(conv_dir):
    """(repo, project_dir|None) from <...>/<X>/conversations/<conv>; X is `.scaffolding` or the repo bucket."""
    parts = os.path.abspath(conv_dir).split(os.sep)
    if len(parts) >= 4 and parts[-2] == "conversations":
        if parts[-3] == ".scaffolding":
            return parts[-4], os.sep.join(parts[:-3])
        return parts[-3], None
    return "unknown", None


def _iter_json(path, needles=None):
    try:
        with open(path, "rb") as fh:
            for raw in fh:
                if needles and not any(n in raw for n in needles):
                    continue
                try:
                    obj = json.loads(raw)
                except ValueError:
                    continue
                if isinstance(obj, dict):
                    yield obj
    except OSError:
        return


def _frame_data(obj):
    """step frame -> (kind, inner dict)."""
    d = obj.get("data")
    if obj.get("type") == "step" and isinstance(d, dict) and isinstance(d.get("data"), dict):
        return d.get("type"), d["data"]
    return None, None


def extract_platform(stream_path, conv, run, repo, project_dir, default_agent="main"):
    """Return (records, footer_status) from one task's output.jsonl."""
    ctx = {"src": "platform", "conv": conv, "run": run, "repo": repo, "project_dir": project_dir}
    subagents, by_id, records, status = {}, {}, [], None
    for obj in _iter_json(stream_path):
        kind, data = _frame_data(obj)
        if kind == "agent_start":
            tid, nm = ident(data.get("tool_use_id")), agent_name(data.get("agent"), None)
            if tid and nm:
                subagents[tid] = nm
        elif kind == "tool_call":
            parent = ident(data.get("parent_tool_use_id"))
            agent = subagents.get(parent, default_agent) if parent else default_agent
            rec = make_record(ctx, len(records) + 1, data.get("id"), data.get("tool"), data.get("input"),
                              iso_ts(obj.get("ts")), agent, parent)
            records.append(rec)
            if rec["id"]:
                by_id[rec["id"]] = rec
        elif kind == "tool_result":
            rec = by_id.get(ident(data.get("tool_use_id")))
            ok = data.get("success")  # content deliberately not read
            if rec is not None and isinstance(ok, bool):
                rec["status"] = "ok" if ok else "error"
        elif obj.get("type") == "done" and isinstance(obj.get("data"), dict):
            s = obj["data"].get("status")
            status = s if s in ("completed", "failed", "cancelled") else "unknown"
    return records, status


def footer(ctx, status, calls, errors, truncated):
    return {"v": 1, "run": ctx["run"], "end": True, "status": status or "unknown",
            "calls": calls, "errors": errors, "truncated": truncated}


def write_platform(task_dir, conv_dir, force=False, agent="main"):
    """Write conversations/<conv>/actions/<run>.jsonl. Returns the written path or None."""
    run = ident(os.path.basename(os.path.normpath(task_dir)))
    conv = ident(os.path.basename(os.path.normpath(conv_dir)))
    stream = os.path.join(task_dir, "output.jsonl")
    if not run or not conv or not os.path.isfile(stream):
        return None
    repo, project_dir = repo_and_project(conv_dir)
    out_dir = os.path.join(conv_dir, "actions")
    out = os.path.join(out_dir, run + ".jsonl")
    if os.path.exists(out) and not force:
        return None
    records, status = extract_platform(stream, conv, run, repo, project_dir, agent_name(agent))
    kept, truncated = apply_caps(records)
    errors = sum(1 for r in kept if r["status"] == "error")
    ctx = {"run": run}
    os.makedirs(out_dir, exist_ok=True)
    tmp = "%s.tmp.%d" % (out, os.getpid())
    try:
        append_lines(tmp, [dumps(r) for r in kept] + [dumps(footer(ctx, status, len(records), errors, truncated))])
        os.replace(tmp, out)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return out


# ---------------------------------------------------------------- local


def _load_cursor(path):
    try:
        with open(path, encoding="utf-8") as fh:
            cur = json.load(fh)
        return cur if isinstance(cur, dict) else {}
    except (OSError, ValueError):
        return {}


def _read_chunk(path, offset, budget, resync):
    """Complete lines from `offset`, at most `budget` bytes. Returns (lines, new_offset, resync)."""
    try:
        size = os.path.getsize(path)
        if offset > size:
            offset = 0
        with open(path, "rb") as fh:
            fh.seek(offset)
            buf = fh.read(budget)
    except OSError:
        return [], offset, resync
    if resync:
        nl = buf.find(b"\n")
        if nl < 0:
            return [], offset + len(buf), True
        buf, offset, resync = buf[nl + 1:], offset + nl + 1, False
    end = buf.rfind(b"\n")
    if end < 0:
        # No full line in the budget: a single huge line. Skip it rather than stall forever.
        return ([], offset + len(buf), True) if len(buf) >= budget else ([], offset, False)
    return buf[:end].split(b"\n"), offset + end + 1, False


def _blocks(obj):
    msg = obj.get("message")
    content = msg.get("content") if isinstance(msg, dict) else None
    return [b for b in content if isinstance(b, dict)] if isinstance(content, list) else []


def extract_local(transcript, session_id, conv_dir, project_dir, final=False):
    """Incrementally append new tool calls since the last pass. Returns the number of records written."""
    sid = ident(session_id)
    if not sid or not os.path.isfile(transcript):
        return 0
    repo = os.path.basename(os.path.abspath(project_dir)) if project_dir else repo_and_project(conv_dir)[0]
    ctx = {"src": "local", "conv": sid, "run": sid, "repo": repo, "project_dir": project_dir}
    out_dir = os.path.join(conv_dir, "actions")
    os.makedirs(out_dir, exist_ok=True)
    cur_path = os.path.join(out_dir, ".cursor.json")
    cur = _load_cursor(cur_path)
    files, pending = cur.get("files", {}), cur.get("pending", {})
    seq, count, size, truncated = (int(cur.get(k, 0)) for k in ("seq", "count", "bytes", "truncated"))
    sources = [(transcript, "main", None)]
    for sub in sorted(glob.glob(os.path.join(transcript[:-len(".jsonl")], "subagents", "agent-*.jsonl"))):
        meta = {}
        try:
            with open(sub[:-len(".jsonl")] + ".meta.json", encoding="utf-8") as fh:
                meta = json.load(fh)
        except (OSError, ValueError):
            pass
        sources.append((sub, agent_name(meta.get("agentType"), "subagent"), ident(meta.get("toolUseId"))))
    budget, lines_out = LOCAL_BUDGET, []

    def emit(rec):
        nonlocal count, size, truncated
        line = dumps(rec)
        n = len(line.encode("utf-8")) + 1
        if (count >= MAX_RECORDS or size + n > MAX_BYTES) and not keep_when_capped(rec):
            truncated += 1
            return
        count, size = count + 1, size + n
        lines_out.append(line)

    for path, agent, parent in sources:
        if budget <= 0:
            break
        st = files.get(path, {})
        lines, off, resync = _read_chunk(path, int(st.get("off", 0)), budget, bool(st.get("resync")))
        budget -= max(0, off - int(st.get("off", 0)))
        files[path] = {"off": off, "resync": resync}
        for raw in lines:
            if b'"tool_use"' not in raw and b'"tool_result"' not in raw:
                continue
            try:
                obj = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(obj, dict):
                continue
            for b in _blocks(obj):
                if b.get("type") == "tool_use":
                    seq += 1
                    rec = make_record(ctx, seq, b.get("id"), b.get("name"), b.get("input"),
                                      iso_ts(obj.get("timestamp")), agent, parent)
                    if rec["id"]:
                        pending[rec["id"]] = rec
                    else:
                        emit(rec)
                elif b.get("type") == "tool_result":
                    rec = pending.pop(ident(b.get("tool_use_id")) or "", None)
                    if rec is not None:
                        err = b.get("is_error")  # content deliberately not read
                        rec["status"] = "error" if err is True else "ok"
                        emit(rec)
    if final:
        for rec in sorted(pending.values(), key=lambda r: r["seq"]):
            emit(rec)
        pending = {}
        errors = sum(1 for ln in lines_out if '"status":"error"' in ln)
        lines_out.append(dumps(footer(ctx, "completed", seq, errors, truncated)))
    if lines_out:
        append_lines(os.path.join(out_dir, sid + ".jsonl"), lines_out)
    cur.update({"files": files, "pending": pending, "seq": seq, "count": count, "bytes": size, "truncated": truncated})
    tmp = "%s.tmp.%d" % (cur_path, os.getpid())
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cur, fh)
    os.replace(tmp, cur_path)
    return len(lines_out)
