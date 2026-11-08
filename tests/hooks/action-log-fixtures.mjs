#!/usr/bin/env node
// Build synthetic fixtures for test-action-log.sh. Usage: action-log-fixtures.mjs <outdir>
//
// Plants 10 secrets (SECRETS) in tool inputs / outputs / prompts. Values are fake.
// Writes <out>/secrets.txt (one per line), <out>/platform/output.jsonl and <out>/local/<sid>.jsonl (+ subagents/).
// Output is byte-identical to the python generator it replaces (tests/hooks/action_log_fixtures.py, <= 2.37.0).
import fs from 'node:fs';
import path from 'node:path';
import { pyDumps } from '../../hooks/lib/hook-io.mjs';

export const SECRETS = [
  'hvs.CAESIJ8wX9kQ2mZpL4vB7nRtYd3sUe6a', // 1 vault token (Bash env prefix)
  'eyJhbGciOiJIUzI1NiJ9.leaktestpayload9.sig8sig8sig8', // 2 bearer jwt (Bash header)
  'Zq9PlantedPw77', // 3 url userinfo password (Bash)
  'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', // 4 github token (Edit new_string)
  'sk-ant-' + 'api03-LEAK9x8y7z6w5v4u3t2s1r0q9p8o7n6m5l4k', // 5 anthropic key (tool_result content)
  'AKIA' + 'LEAKTEST1234ABCD', // 6 aws key (Write content)
  'glpat-' + 'LeakTestGitlab0123456789', // 7 gitlab pat (MCP token arg + content)
  'HeredocPw!42xyz', // 8 heredoc body password (Bash)
  'PROMPT-SECRET-Quux-5521', // 9 Task prompt
  'tskey-auth-' + 'kLeakTest123CNTRL-abcdefghijklmnop', // 10 tailscale key (WebFetch query + result)
];

const call = (id, tool, input, ts, parent = null) => {
  const d = { tool, input, id };
  if (parent) d.parent_tool_use_id = parent;
  return { type: 'step', data: { type: 'tool_call', data: d }, ts };
};
const result = (id, ok, content, ts) => ({ type: 'step', data: { type: 'tool_result', data: { success: ok, content, tool_use_id: id } }, ts });

export function calls() {
  const s = SECRETS;
  return [
    ['t1', 'Bash', { command: `VAULT_TOKEN=${s[0]} curl -H "Authorization: Bearer ${s[1]}" https://admin:${s[2]}@host.example/x`, description: 'call api' }, true, 'ok'],
    ['t2', 'Edit', { file_path: '/work/proj/ansible/a.yml', old_string: 'x', new_string: `token: ${s[3]}` }, true, 'edited'],
    ['t3', 'Bash', { command: `cat > .env <<EOF\nDB_PASSWORD=${s[7]}\nEOF` }, true, 'ok'],
    ['t4', 'Read', { file_path: '/work/proj/README.md' }, true, `content ${s[4]}`],
    ['t5', 'Write', { file_path: '/work/proj/creds.txt', content: `aws=${s[5]}` }, true, 'ok'],
    ['t6', 'mcp__gitea__create_issue', { owner: 'komluk', repo: 'homelab', token: s[6], body: s[6], title: s[6] }, true, `created ${s[6]}`],
    ['t7', 'Task', { subagent_type: 'scaffolding:developer', description: 'implement x', prompt: s[8] }, true, 'done'],
    ['t8', 'WebFetch', { url: `https://example.com/p/q?api_key=${s[9]}`, prompt: s[9] }, true, `page ${s[9]}`],
    ['t9', 'Bash', { command: 'tofu apply -auto-approve' }, false, `Error: ${s[4]}`],
    ['t10', 'Bash', { command: 'tofu apply -auto-approve' }, false, `Error: ${s[4]}`],
    ['t11', 'TodoWrite', { todos: [{ content: s[8] }] }, true, 'ok'],
  ];
}

const jsonl = (rows) => rows.map((r) => `${pyDumps(r)}\n`).join('');

export function platformRows(withResults = true) {
  const rows = [{ type: 'step', data: { type: 'agent_start', data: { agent: 'scaffolding:developer', tool_use_id: 't7', description: 'd' } }, ts: 1792489379.0 }];
  const ts = 1792489380.0;
  calls().forEach(([cid, tool, inp, ok, content], i) => {
    rows.push(call(cid, tool, inp, ts + i));
    if (withResults) rows.push(result(cid, ok, content, ts + i + 0.5));
  });
  rows.push(call('sub1', 'Edit', { file_path: '/work/proj/b.py', new_string: 'q' }, ts + 30, 't7'));
  rows.push({ type: 'done', data: { status: 'failed', exit_code: 1n }, ts: ts + 40 });
  return rows;
}

export const tu = (id, tool, input, ts, sid) => ({
  type: 'assistant', timestamp: ts, sessionId: sid, isSidechain: false, message: { content: [{ type: 'tool_use', id, name: tool, input }] },
});
export const tr = (id, err, content, ts, sid) => ({
  type: 'user', timestamp: ts, sessionId: sid, message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: err, content }] },
});

export function localRows(sid, start, n) {
  const rows = [];
  calls().slice(start, start + n).forEach(([cid, tool, inp, ok, content], k) => {
    const ts = `2026-10-21T10:${String(start + k).padStart(2, '0')}:00.000Z`;
    rows.push(tu(cid, tool, inp, ts, sid), tr(cid, !ok, content, ts, sid));
  });
  return rows;
}

export const SID = '11111111-2222-3333-4444-555555555555';

function writePlatform(dir, withResults = true) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'output.jsonl'), `{not json\n${jsonl(platformRows(withResults))}`);
}

export function main(out) {
  writePlatform(path.join(out, 'platform'));
  writePlatform(path.join(out, 'platform-noresult'), false);
  const d = path.join(out, 'local');
  fs.mkdirSync(path.join(d, SID, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(d, `${SID}.jsonl`), jsonl(localRows(SID, 0, 5)));
  fs.writeFileSync(
    path.join(d, SID, 'subagents', 'agent-abc.jsonl'),
    jsonl([tu('s1', 'Edit', { file_path: '/work/proj/sub.py', new_string: SECRETS[3] }, '2026-10-21T10:30:00.000Z', SID), tr('s1', false, 'ok', '2026-10-21T10:30:01.000Z', SID)]),
  );
  fs.writeFileSync(path.join(d, SID, 'subagents', 'agent-abc.meta.json'), '{"agentType": "scaffolding:debugger", "toolUseId": "t7"}');
  fs.writeFileSync(path.join(d, 'more.jsonl'), jsonl(localRows(SID, 5, 6))); // the rest of the calls, appended later by the test
  fs.writeFileSync(path.join(out, 'secrets.txt'), `${SECRETS.join('\n')}\n`);
  // one big transcript for the perf check (~45 MB of non-tool lines + a few calls)
  const fd = fs.openSync(path.join(d, 'big.jsonl'), 'w');
  const pad = `${pyDumps({ type: 'assistant', message: { content: [{ type: 'text', text: 'x'.repeat(4000) }] } })}\n`;
  const block = pad.repeat(500);
  for (let i = 0; i < 23; i++) fs.writeSync(fd, block);
  fs.writeSync(fd, jsonl(localRows(SID, 0, 3)));
  fs.closeSync(fd);
}

if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) main(process.argv[2]);
