#!/usr/bin/env python3
"""Episodic action log CLI (stdlib only). Run as `python3 -I action_log.py <cmd>`.

  platform --task-dir D --conv-dir D [--force] [--agent NAME]
  local    --transcript F --session-id ID --conv-dir D [--project-dir D] [--final]
  render   --conv-dir D
  backfill ROOT              ROOT = <share>/projects (walks */conversations/*/tasks/*)

Metadata only: never records tool output, file contents, prompts or MCP results.
Fail-open: every command exits 0 and logs a one-line warning to stderr on error.
On success `render` prints the timeline path (stdout) so callers can index it.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from action_log_lib import extract, render  # noqa: E402
from action_log_lib.records import rotate  # noqa: E402


def _warn(msg):
    sys.stderr.write("action_log: %s\n" % msg)


def cmd_platform(a):
    out = extract.write_platform(a.task_dir, a.conv_dir, force=a.force, agent=a.agent)
    if out:
        rotate(os.path.dirname(out), keep_name=os.path.basename(out))
    return out


def cmd_local(a):
    project = a.project_dir or os.environ.get("CLAUDE_PROJECT_DIR") or None
    n = extract.extract_local(a.transcript, a.session_id, a.conv_dir, project, final=a.final)
    rotate(os.path.join(a.conv_dir, "actions"))
    return n


def cmd_render(a):
    res = render.render(a.conv_dir)
    if res:
        print(res[0])
        print("calls=%d errors=%d" % (res[1], res[2]))
    return res


def cmd_backfill(a):
    done = 0
    root = os.path.abspath(a.root)
    for repo in sorted(os.listdir(root)):
        convs = os.path.join(root, repo, "conversations")
        if not os.path.isdir(convs):
            continue
        for conv in sorted(os.listdir(convs)):
            conv_dir, tasks = os.path.join(convs, conv), os.path.join(convs, conv, "tasks")
            if not os.path.isdir(tasks):
                continue
            for task in sorted(os.listdir(tasks)):
                try:
                    if extract.write_platform(os.path.join(tasks, task), conv_dir):
                        done += 1
                except Exception as exc:  # noqa: BLE001
                    _warn("backfill %s/%s: %s" % (conv, task, exc))
            try:
                render.render(conv_dir)
            except Exception as exc:  # noqa: BLE001
                _warn("render %s: %s" % (conv, exc))
    print("backfilled=%d" % done)
    return done


def build_parser():
    p = argparse.ArgumentParser(prog="action_log.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("platform")
    s.add_argument("--task-dir", required=True)
    s.add_argument("--conv-dir", required=True)
    s.add_argument("--force", action="store_true")
    s.add_argument("--agent", default="main")
    s.set_defaults(fn=cmd_platform)
    s = sub.add_parser("local")
    s.add_argument("--transcript", required=True)
    s.add_argument("--session-id", required=True)
    s.add_argument("--conv-dir", required=True)
    s.add_argument("--project-dir")
    s.add_argument("--final", action="store_true")
    s.set_defaults(fn=cmd_local)
    s = sub.add_parser("render")
    s.add_argument("--conv-dir", required=True)
    s.set_defaults(fn=cmd_render)
    s = sub.add_parser("backfill")
    s.add_argument("root")
    s.set_defaults(fn=cmd_backfill)
    return p


def main(argv=None):
    os.umask(0o002)
    try:
        args = build_parser().parse_args(argv)
    except SystemExit:
        return 0  # fail-open even on bad usage
    try:
        args.fn(args)
    except Exception as exc:  # noqa: BLE001 - never affect the run
        _warn("%s failed: %s" % (args.cmd, exc))
    return 0


if __name__ == "__main__":
    sys.exit(main())
