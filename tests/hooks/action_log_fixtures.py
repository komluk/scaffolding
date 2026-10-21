#!/usr/bin/env python3
"""Build synthetic fixtures for test-action-log.sh. Usage: fixtures.py <outdir>

Plants 10 secrets (SECRETS) in tool inputs / outputs / prompts. Values are fake.
Writes <out>/secrets.txt (one per line), <out>/platform/output.jsonl and
<out>/local/<sid>.jsonl (+ subagents/). Also a prefilled `dup` stream for repeats.
"""
import json
import os
import sys

SECRETS = [
    "hvs.CAESIJ8wX9kQ2mZpL4vB7nRtYd3sUe6a",                      # 1 vault token (Bash env prefix)
    "eyJhbGciOiJIUzI1NiJ9.leaktestpayload9.sig8sig8sig8",       # 2 bearer jwt (Bash header)
    "Zq9PlantedPw77",                                            # 3 url userinfo password (Bash)
    "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",            # 4 github token (Edit new_string)
    "sk-ant-" + "api03-LEAK9x8y7z6w5v4u3t2s1r0q9p8o7n6m5l4k",   # 5 anthropic key (tool_result content)
    "AKIA" + "LEAKTEST1234ABCD",                                 # 6 aws key (Write content)
    "glpat-" + "LeakTestGitlab0123456789",                      # 7 gitlab pat (MCP token arg + content)
    "HeredocPw!42xyz",                                           # 8 heredoc body password (Bash)
    "PROMPT-SECRET-Quux-5521",                                   # 9 Task prompt
    "tskey-auth-" + "kLeakTest123CNTRL-abcdefghijklmnop",       # 10 tailscale key (WebFetch query + result)
]


def call(i, tool, inp, ts, parent=None):
    d = {"tool": tool, "input": inp, "id": i}
    if parent:
        d["parent_tool_use_id"] = parent
    return {"type": "step", "data": {"type": "tool_call", "data": d}, "ts": ts}


def result(i, ok, content, ts):
    return {"type": "step", "data": {"type": "tool_result", "data": {"success": ok, "content": content, "tool_use_id": i}}, "ts": ts}


def calls():
    s = SECRETS
    return [
        ("t1", "Bash", {"command": "VAULT_TOKEN=%s curl -H \"Authorization: Bearer %s\" https://admin:%s@host.example/x" % (s[0], s[1], s[2]),
                        "description": "call api"}, True, "ok"),
        ("t2", "Edit", {"file_path": "/work/proj/ansible/a.yml", "old_string": "x", "new_string": "token: " + s[3]}, True, "edited"),
        ("t3", "Bash", {"command": "cat > .env <<EOF\nDB_PASSWORD=%s\nEOF" % s[7]}, True, "ok"),
        ("t4", "Read", {"file_path": "/work/proj/README.md"}, True, "content " + s[4]),
        ("t5", "Write", {"file_path": "/work/proj/creds.txt", "content": "aws=" + s[5]}, True, "ok"),
        ("t6", "mcp__gitea__create_issue", {"owner": "komluk", "repo": "homelab", "token": s[6], "body": s[6], "title": s[6]}, True, "created " + s[6]),
        ("t7", "Task", {"subagent_type": "scaffolding:developer", "description": "implement x", "prompt": s[8]}, True, "done"),
        ("t8", "WebFetch", {"url": "https://example.com/p/q?api_key=" + s[9], "prompt": s[9]}, True, "page " + s[9]),
        ("t9", "Bash", {"command": "tofu apply -auto-approve"}, False, "Error: " + s[4]),
        ("t10", "Bash", {"command": "tofu apply -auto-approve"}, False, "Error: " + s[4]),
        ("t11", "TodoWrite", {"todos": [{"content": s[8]}]}, True, "ok"),
    ]


def write_platform(path, with_results=True):
    os.makedirs(path, exist_ok=True)
    rows = [{"type": "step", "data": {"type": "agent_start", "data": {"agent": "scaffolding:developer", "tool_use_id": "t7", "description": "d"}}, "ts": 1792489379.0}]
    ts = 1792489380.0
    for i, (cid, tool, inp, ok, content) in enumerate(calls()):
        rows.append(call(cid, tool, inp, ts + i))
        if with_results:
            rows.append(result(cid, ok, content, ts + i + 0.5))
    rows.append(call("sub1", "Edit", {"file_path": "/work/proj/b.py", "new_string": "q"}, ts + 30, parent="t7"))
    rows.append({"type": "done", "data": {"status": "failed", "exit_code": 1}, "ts": ts + 40})
    with open(os.path.join(path, "output.jsonl"), "w") as fh:
        fh.write("{not json\n")
        for r in rows:
            fh.write(json.dumps(r) + "\n")


def tu(i, tool, inp, ts, sid):
    return {"type": "assistant", "timestamp": ts, "sessionId": sid, "isSidechain": False,
            "message": {"content": [{"type": "tool_use", "id": i, "name": tool, "input": inp}]}}


def tr(i, err, content, ts, sid):
    return {"type": "user", "timestamp": ts, "sessionId": sid,
            "message": {"content": [{"type": "tool_result", "tool_use_id": i, "is_error": err, "content": content}]}}


def local_rows(sid, start, n):
    rows = []
    for k, (cid, tool, inp, ok, content) in enumerate(calls()[start:start + n]):
        ts = "2026-10-21T10:%02d:00.000Z" % (start + k)
        rows += [tu(cid, tool, inp, ts, sid), tr(cid, not ok, content, ts, sid)]
    return rows


def main(out):
    sid = "11111111-2222-3333-4444-555555555555"
    write_platform(os.path.join(out, "platform"))
    os.makedirs(os.path.join(out, "platform-noresult"), exist_ok=True)
    write_platform(os.path.join(out, "platform-noresult"), with_results=False)
    d = os.path.join(out, "local")
    os.makedirs(os.path.join(d, sid, "subagents"), exist_ok=True)
    with open(os.path.join(d, sid + ".jsonl"), "w") as fh:
        for r in local_rows(sid, 0, 5):
            fh.write(json.dumps(r) + "\n")
    with open(os.path.join(d, sid, "subagents", "agent-abc.jsonl"), "w") as fh:
        fh.write(json.dumps(tu("s1", "Edit", {"file_path": "/work/proj/sub.py", "new_string": SECRETS[3]}, "2026-10-21T10:30:00.000Z", sid)) + "\n")
        fh.write(json.dumps(tr("s1", False, "ok", "2026-10-21T10:30:01.000Z", sid)) + "\n")
    with open(os.path.join(d, sid, "subagents", "agent-abc.meta.json"), "w") as fh:
        json.dump({"agentType": "scaffolding:debugger", "toolUseId": "t7"}, fh)
    with open(os.path.join(d, "more.jsonl"), "w") as fh:  # the rest of the calls, appended later by the test
        for r in local_rows(sid, 5, 6):
            fh.write(json.dumps(r) + "\n")
    with open(os.path.join(out, "secrets.txt"), "w") as fh:
        fh.write("\n".join(SECRETS) + "\n")
    # one big transcript for the perf check (~45 MB of non-tool lines + a few calls)
    with open(os.path.join(d, "big.jsonl"), "w") as fh:
        pad = json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "x" * 4000}]}}) + "\n"
        for _ in range(11500):
            fh.write(pad)
        for r in local_rows(sid, 0, 3):
            fh.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
