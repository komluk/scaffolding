#!/usr/bin/env node
// action-log.mjs — episodic action log CLI (plain ESM, Node >= 22, node: built-ins only).
//
//   node action-log.mjs platform --task-dir D --conv-dir D [--force] [--agent NAME]
//   node action-log.mjs local    --transcript F --session-id ID --conv-dir D [--project-dir D] [--final]
//   node action-log.mjs render   --conv-dir D
//   node action-log.mjs backfill ROOT              ROOT = <share>/projects (walks */conversations/*/tasks/*)
//
// Metadata only: never records tool output, file contents, prompts or MCP results.
// Fail-open: every command exits 0 and logs a one-line warning to stderr on error.
// On success `render` prints the timeline path, then `calls=N errors=E` (stdout), so callers can index it.
// Port of hooks/lib/action_log.py (<= 2.37.0; run as `python3 -I action_log.py`): same subcommands, flags, stdout, exit codes.
import fs from 'node:fs';
import path from 'node:path';
import { encodeSurrogateEscape, parseJson, readStdin } from './hook-io.mjs';
import { cmpCp, isDir, pyJoin } from './pystd.mjs';
import { ExitError, parseArgs } from './action-log/argparse.mjs';
import { extractLocal, writePlatform } from './action-log/extract.mjs';
import { rotate } from './action-log/records.mjs';
import { render } from './action-log/render.mjs';

const warn = (msg) => process.stderr.write(`action-log: ${msg}\n`);

function cmdPlatform(a) {
  const out = writePlatform(a.task_dir, a.conv_dir, a.force, a.agent);
  if (out) rotate(path.dirname(out), path.basename(out));
}

function cmdLocal(a) {
  const project = a.project_dir || process.env.CLAUDE_PROJECT_DIR || null;
  extractLocal(a.transcript, a.session_id, a.conv_dir, project, a.final);
  rotate(pyJoin(a.conv_dir, 'actions'));
}

function cmdRender(a) {
  const res = render(a.conv_dir);
  if (res) process.stdout.write(`${res[0]}\ncalls=${res[1]} errors=${res[2]}\n`);
}

function cmdBackfill(a) {
  let done = 0;
  const root = path.resolve(a.root);
  for (const repo of fs.readdirSync(root).sort(cmpCp)) {
    const convs = pyJoin(root, repo, 'conversations');
    if (!isDir(convs)) continue;
    for (const conv of fs.readdirSync(convs).sort(cmpCp)) {
      const convDir = pyJoin(convs, conv);
      const tasks = pyJoin(convDir, 'tasks');
      if (!isDir(tasks)) continue;
      for (const task of fs.readdirSync(tasks).sort(cmpCp)) {
        try {
          if (writePlatform(pyJoin(tasks, task), convDir)) done++;
        } catch (e) {
          warn(`backfill ${conv}/${task}: ${e.message}`);
        }
      }
      try {
        render(convDir);
      } catch (e) {
        warn(`render ${conv}: ${e.message}`);
      }
    }
  }
  process.stdout.write(`backfilled=${done}\n`);
}

/**
 * Internal, for hooks/action-log.sh (not part of the documented CLI): stdin = the hook JSON. Prints three lines,
 * session_id / transcript_path / "1" for SessionEnd else "0", only when session_id is a str of 8-64 [A-Za-z0-9-] and
 * transcript_path a str ending in .jsonl; prints nothing otherwise (bad JSON, a non-object, wrong types).
 */
function hookFields() {
  try {
    const d = parseJson(readStdin());
    if (!(d instanceof Map)) return;
    const sid = d.get('session_id');
    const tp = d.get('transcript_path');
    if (typeof sid === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(sid) && typeof tp === 'string' && tp.endsWith('.jsonl')) {
      fs.writeSync(1, encodeSurrogateEscape(`${sid}\n${tp}\n${d.get('hook_event_name') === 'SessionEnd' ? '1' : '0'}\n`));
    }
  } catch {
    /* unreadable input: print nothing (the shim then exits 0) */
  }
}

const COMMANDS = { platform: cmdPlatform, local: cmdLocal, render: cmdRender, backfill: cmdBackfill };

export function main(argv) {
  process.umask(0o002);
  if (argv[0] === 'hook-fields') {
    hookFields();
    return 0;
  }
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (e instanceof ExitError) return 0; // fail-open even on bad usage
    throw e;
  }
  try {
    COMMANDS[args.cmd](args);
  } catch (e) {
    warn(`${args.cmd} failed: ${e.message}`); // never affect the run
  }
  return 0;
}

if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) process.exitCode = main(process.argv.slice(2));
