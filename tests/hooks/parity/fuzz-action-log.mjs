#!/usr/bin/env node
// Differential fuzz: the python action log (v2.37.0) against the node port.
//
//   node fuzz-action-log.mjs --old DIR_WITH_PYTHON_HOOKS [--new HOOKS_DIR] [--n 1200] [--strings 3000] [--seed 1] [--keep]
//
// --old is a checkout of the pre-port plugin (e.g. `git archive v2.37.0 | tar -x -C /tmp/old`; point at its hooks/ dir).
// Part 1 (--strings): random strings through redact() and random tool inputs through target_for(); both implementations
//   run over the same JSON file, results must be identical (exact string / null).
// Part 2 (--n): end-to-end CLI scenarios in twin sandboxes (same layout, same-length paths): platform streams, local
//   transcripts over several passes (+ subagents, cursor, --final), render over hand-made run files (plain and gzip),
//   and random argv. Exit code, stdout, stderr (warning text normalised) and every file written (content, mode) must be equal.
// Exit 1 on any difference. Needs python3 on PATH for the OLD side only.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseJson, pyDumps } from '../../../hooks/lib/hook-io.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const OLD = path.resolve(opt('--old', ''));
const NEW = path.resolve(opt('--new', path.join(here, '../../../hooks')));
const N = Number(opt('--n', 1200));
const NS = Number(opt('--strings', 3000));
const SEED = Number(opt('--seed', 1));
if (!opt('--old') || !fs.existsSync(path.join(OLD, 'lib', 'action_log.py'))) {
  console.error('usage: fuzz-action-log.mjs --old <python hooks dir> [--new <hooks dir>] [--n N] [--strings N] [--seed S] [--keep]');
  process.exit(2);
}

// ---------------------------------------------------------------- seeded rng
let state = SEED >>> 0;
const rnd = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (n) => Math.floor(rnd() * n);
const pick = (a) => a[int(a.length)];
const chance = (p) => rnd() < p;
const many = (n, f) => Array.from({ length: n }, f);

// ---------------------------------------------------------------- generators
const SECRET_BITS = ['hvs.CAESIJlTestTokenLeak0123456789abcd', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sigsigsig1', 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'sk-ant-api03-LEAK9x8y7z6w5v4u3t2s1r0q9p8o7n6m5l4k',
  'AKIALEAKTEST1234ABCD', 'glpat-LeakTestGitlab0123456789', 'tskey-auth-kLeakTest123CNTRL-abcdefghijklmnop', 'xoxb-1234567890-abcdefghij', 'npm_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8',
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----', '44051401458', 'PL61 1090 1014 0000 0712 1981 2874', 'PL61109010140000071219812874', 'DE89 3704 0044 0532 0130 00', 'GB82 WEST 1234 5698 7654 32',
  'a'.repeat(40), 'f'.repeat(64), '11111111-2222-3333-4444-555555555555', 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/AbCd', 'x'.repeat(31), 'Zq9PlantedPw77', 'user@host:path/to/some/very/long/directory/name_with_numbers_1234567890abcdef/file.ts',
  'sig=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGh%3D', 'abc123XYZ0001Q~abcdefghijklmnopqrstuvwxyz012345', 'user:pa55w0rd@10.0.0.1'];
const WORDS = ['token', 'TOKEN', 'Token', 'secret', 'password', 'PASSWD', 'pwd', 'api_key', 'api-key', 'ApiKey', 'access_key', 'client_secret', 'authorization', 'Authorization', 'x-api-key', 'private-token', 'Bearer', 'bearer', 'BEARER', 'TOKEN',
  'ſecret', 'tokeN', 'ŧoken', 'KEY', 'Kelvin', 'sİgn', 'ıauth', 'pass', 'pw', 'auth', 'credential', 'user', '-p', '-u', '--user', '--password', '--pass', '--token', '--api-key', '--auth', '--client-secret', '-x', '--', 'sig', 'key'];
const SEPS = [' ', '  ', '\t', '\n', '=', ': ', ':', '=\t', ' = ', ' ', '\x1c', ' ', '\x85', '　', '\r', '\v', '​', ''];
const PUNCT = ['"', "'", '(', ')', '[', ']', '{', '}', ',', ';', '&', '?', '/', '@', '://', '-', '_', '.', '#', '%', '*', '\\', '`'];
const UNI = ['zażółć', 'gęślą', 'jaźń', '😀', 'İ', 'ı', 'ſ', 'K', '٣٤٥', '१२३', '𝟘𝟙', 'ǅ', 'é', 'ß', '́', '中文', 'العربية', '\u0000', '\u0001', '\ud800', '\udfff', '﻿', ' x'];
const FRAG = [...SECRET_BITS, ...WORDS, ...PUNCT, ...UNI, 'https://u:pw@host.example:8443/p?token=abc&x=1', 'http://[::1]:80/x', 'ENV=1', 'A_B=2', 'curl', 'ls -la', 'echo', 'cat <<EOF', '| base64', '|base64', '1234', '0123', 'deadbeef', 'DEADBEEF1234', '12-34', 'a/b/c'];
const str = () => many(1 + int(7), () => pick([pick(FRAG), pick(FRAG), pick(WORDS) + pick(SEPS) + pick(SECRET_BITS), pick(SEPS)])).join(chance(0.6) ? pick(SEPS) : '');
const bigStr = () => many(1 + int(20), str).join(pick(['\n', ' ', '/']));

const TOOLS = ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Read', 'Grep', 'Glob', 'Task', 'Agent', 'WebFetch', 'WebSearch', 'TodoWrite', 'mcp__gitea__create_issue', 'mcp__memory__semantic_search', 'mcp__a', 'mcp__a__b__c', 'mcp__x__y', 'LSP', 'bad name', '', 'a'.repeat(81), 'mcp__', 'mcp____'];
const ROOTS = ['/work/proj', '/home/user', '/home', '/work/project2', '/tmp', '', '.', '..', '~', '/work/proj/', '//work//proj'];
const pathStr = () => pick([...ROOTS, '@PROJ@', '@HOME@']) + pick(['', '/', '/a/b.ts', '/src/../x', '//x//y', '/./z', '/ą/ę.py', '/very/' + 'long/'.repeat(30) + 'f.ts', '/a b/c d']);
const urlStr = () => pick(['https', 'http', 'HTTPS', 'ftp', 'file', 'javascript', '', 'x+y', '1a']) + pick(['://', ':', '//', ':///', '']) + pick(['', 'user:pw@', 'u@', '@', 'a@b@']) +
  pick(['example.com', 'Host.EXAMPLE', '[::1]', '[2001:db8::1]', '[1.2.3.4]', '[v1.x]', '[::1', '::1]', 'h:abc', 'h:99999', 'h:65535', 'h:', 'h:٣', 'exämple.com', 'ex℀.com', '', 'h']) + pick(['', ':80', ':443', ':0', ':65536']) + pick(['', '/', '/p/q', '/ü', '?q=1', '#f', '/x?token=zzz#a']) + pick(['', '\n', ' ', '\t']);
const val = () => pick([() => str(), () => str(), () => int(1000), () => 1.5, () => null, () => true, () => false, () => [str()], () => ({ k: str() }), () => '', () => 'x'.repeat(200)])();
function toolInput(tool) {
  const o = {};
  const put = (k, v) => {
    if (chance(0.9)) o[k] = v;
  };
  if (['Edit', 'Write', 'MultiEdit', 'Read', 'NotebookEdit'].includes(tool)) {
    put('file_path', chance(0.85) ? pathStr() : val());
    if (chance(0.3)) put('notebook_path', pathStr());
  } else if (tool === 'Bash') {
    put('command', chance(0.9) ? bigStr() : val());
    if (chance(0.4)) put('description', chance(0.85) ? str() : val());
  } else if (tool === 'Grep' || tool === 'Glob') {
    put('pattern', chance(0.9) ? str() : val());
    if (chance(0.5)) put('path', chance(0.9) ? pathStr() : val());
  } else if (tool === 'Task' || tool === 'Agent') {
    put('subagent_type', chance(0.9) ? pick(['scaffolding:developer', 'x', 'scaffolding:scaffolding:y', str()]) : val());
    if (chance(0.6)) put('description', chance(0.9) ? str() : val());
    if (chance(0.3)) put('prompt', str());
  } else if (tool === 'WebFetch') put('url', chance(0.9) ? urlStr() : val());
  else if (tool === 'WebSearch') put('query', chance(0.9) ? str() : val());
  else {
    for (const k of pick([['owner', 'repo'], ['index', 'pull_number', 'number'], ['method', 'state', 'branch', 'ref'], ['corpus', 'relative_path', 'project_id'], ['node', 'vmid', 'name', 'path', 'file_path'], ['token', 'body', 'content'], ['owner', 'repo', 'token', 'x']])) {
      put(k, chance(0.8) ? str() : val());
    }
  }
  if (chance(0.15)) o[str()] = val();
  return o;
}
const anyInput = (tool) => (chance(0.93) ? toolInput(tool) : pick([null, 'str', 5, [1], true, {}]));

function toolName() {
  return chance(0.9) ? pick(TOOLS) : pick([null, 5, true, str(), 'Bash\n', 'mcp__gitea__' + str()]);
}
const ident = () => pick(['t1', 't2', 'toolu_01ABC', 'a'.repeat(80), 'a'.repeat(81), 'bad id', 'x:y@z', 'ok-1\n', '', null, 5, true, 'ą', 't1']);
const ts = () => pick([() => 1792489380 + int(100000), () => 1792489380.5 + int(10), () => -1 * int(1000), () => 0, () => '2026-10-21T10:%02d:%02d.123Z'.replace(/%02d/g, () => String(int(60)).padStart(2, '0')), () => '2026-10-21T10:00:00Z',
  () => 'not a time', () => null, () => true, () => 253402300800, () => 1e11, () => 1e300, () => '٢٠٢٦-١٠-٢١T١٠:٠٠:٠٠Z', () => '2026-10-21T10:00:00Z\n', () => [1], () => 1792489380.999999, () => -62135596800, () => 6.7e16])();

// ---------------------------------------------------------------- twin sandboxes
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'alfz-'));
const SB = { py: path.join(ROOT, 'py'), js: path.join(ROOT, 'js') };
const LIBPY = path.join(OLD, 'lib');
const LIBJS = path.join(NEW, 'lib', 'action-log.mjs');
const WRAP = path.join(ROOT, 'wrap.py');
fs.writeFileSync(WRAP, `import argparse, sys
_init = argparse.ArgumentParser.__init__
def init(self, *a, **k):
    if k.get("prog") == "action_log.py":
        k["prog"] = "action-log.mjs"
    _init(self, *a, **k)
argparse.ArgumentParser.__init__ = init
sys.path.insert(0, sys.argv[1])
import action_log
sys.exit(action_log.main(sys.argv[2:]))
`);

function run(side, args, env = {}) {
  const e = { PATH: process.env.PATH, HOME: path.join(SB[side], 'home'), LC_ALL: 'C.UTF-8', TZ: 'UTC', ...env };
  for (const k of Object.keys(e)) e[k] = String(e[k]).replaceAll('@S@', SB[side]).replaceAll('\0', '');
  const a = args.map((x) => x.replaceAll('@S@', SB[side]).replaceAll('\0', '')); // a real argv cannot hold a NUL
  const r = side === 'py'
    ? spawnSync('python3', ['-I', WRAP, LIBPY, ...a], { cwd: SB[side], env: e, encoding: 'buffer', timeout: 60000 })
    : spawnSync('node', [LIBJS, ...a], { cwd: SB[side], env: e, encoding: 'buffer', timeout: 60000 });
  const norm = (b) => b.toString('latin1').replaceAll(SB[side], '@S@').replace(/^action[_-]log: .*$/gm, 'action-log: <warning>');
  return { code: r.status ?? `signal:${r.signal}`, out: norm(r.stdout), err: norm(r.stderr) };
}

function writeBoth(rel, content) {
  for (const side of ['py', 'js']) {
    const f = path.join(SB[side], rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof content === 'string' ? content.replaceAll('@S@', SB[side]) : content);
  }
}

function tree(side) {
  const out = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(d).sort()) {
      const f = path.join(d, n);
      const rel = path.relative(SB[side], f);
      if (rel === 'home' || n === '.lock') continue;
      const st = fs.lstatSync(f);
      if (st.isDirectory()) {
        out.push(`D ${rel} ${(st.mode & 0o777).toString(8)}`);
        walk(f);
      } else {
        let data = fs.readFileSync(f);
        if (n.endsWith('.gz')) {
          try {
            data = zlib.gunzipSync(data);
          } catch {
            /* compare raw */
          }
        }
        out.push(`F ${rel} ${(st.mode & 0o777).toString(8)} ${data.toString('latin1').replaceAll(SB[side], '@S@')}`);
      }
    }
  };
  walk(SB[side]);
  return out;
}
function reset() {
  for (const side of ['py', 'js']) {
    fs.rmSync(SB[side], { recursive: true, force: true });
    fs.mkdirSync(path.join(SB[side], 'home'), { recursive: true });
  }
}

// ---------------------------------------------------------------- part 1: redact / target_for in bulk
let failures = 0;
const report = (kind, input, a, b) => {
  failures++;
  if (failures <= 15) console.log(`DIFF ${kind}\n  input: ${JSON.stringify(input).slice(0, 400)}\n  python: ${JSON.stringify(a)?.slice(0, 400)}\n  node:   ${JSON.stringify(b)?.slice(0, 400)}`);
};

async function stringsPart() {
  const cases = [];
  for (let i = 0; i < NS; i++) {
    if (i % 3 === 0) cases.push({ k: 'redact', s: bigStr() });
    else {
      const tool = toolName();
      cases.push({ k: 'target', tool, inp: anyInput(typeof tool === 'string' ? tool : 'Bash'), pd: chance(0.5) ? pick(['/work/proj', '/work/proj/', '/home/user', null, '']) : null });
    }
  }
  const file = path.join(ROOT, 'cases.json');
  fs.writeFileSync(file, JSON.stringify(cases));
  const pyScript = path.join(ROOT, 'batch.py');
  fs.writeFileSync(pyScript, `import sys, json
sys.path.insert(0, sys.argv[1])
from action_log_lib.redact import redact
from action_log_lib.targets import target_for
cases = json.load(open(sys.argv[2], encoding="utf-8"))
out = [redact(c["s"]) if c["k"] == "redact" else target_for(c["tool"], c["inp"], c.get("pd")) for c in cases]
sys.stdout.buffer.write(json.dumps(out, ensure_ascii=True).encode("ascii"))
`);
  const r = spawnSync('python3', ['-I', pyScript, LIBPY, file], { encoding: 'buffer', maxBuffer: 1 << 28, env: { PATH: process.env.PATH, HOME: '/work/user-home', LC_ALL: 'C.UTF-8' } });
  if (r.status !== 0) throw new Error(`python batch failed: ${r.stderr}`);
  const want = parseJson(r.stdout.toString('ascii'));
  const { redact } = await import(path.join(NEW, 'lib/action-log/redact.mjs'));
  const { targetFor } = await import(path.join(NEW, 'lib/action-log/targets.mjs'));
  const parsed = parseJson(fs.readFileSync(file, 'utf8'));
  let diff = 0;
  parsed.forEach((c, i) => {
    const got = c.get('k') === 'redact' ? redact(c.get('s')) : targetFor(c.get('tool'), c.get('inp'), c.get('pd'));
    if (got !== want[i]) {
      diff++;
      report(c.get('k'), cases[i], want[i], got);
    }
  });
  console.log(`strings: ${cases.length} inputs (${cases.filter((c) => c.k === 'redact').length} redact, ${cases.filter((c) => c.k === 'target').length} target_for), ${diff} differences`);
}

// ---------------------------------------------------------------- part 2: CLI scenarios
const frame = (tool, input, id, t, parent) => ({ type: 'step', data: { type: 'tool_call', data: { tool, input, id, ...(parent === undefined ? {} : { parent_tool_use_id: parent }) } }, ts: t });
const J = (o) => JSON.stringify(o);

function platformStream() {
  const rows = [];
  const n = int(40);
  const ids = [];
  for (let i = 0; i < n; i++) {
    const kind = int(10);
    if (kind < 6) {
      const tool = toolName();
      const id = ident();
      ids.push(id);
      rows.push(frame(tool, anyInput(typeof tool === 'string' ? tool : 'Bash'), id, ts(), chance(0.25) ? ident() : undefined));
    } else if (kind === 6) rows.push({ type: 'step', data: { type: 'tool_result', data: { success: pick([true, false, 1, null, 'x']), content: str(), tool_use_id: chance(0.8) && ids.length ? pick(ids) : ident() } }, ts: ts() });
    else if (kind === 7) rows.push({ type: 'step', data: { type: 'agent_start', data: { agent: pick(['scaffolding:developer', 'x y', 5, null, 'reviewer', str()]), tool_use_id: chance(0.7) && ids.length ? pick(ids) : ident() } }, ts: 1 });
    else if (kind === 8) rows.push({ type: 'done', data: pick([{ status: pick(['completed', 'failed', 'cancelled', 'weird', 5, null]) }, 'x', {}]), ts: ts() });
    else rows.push(pick([{ type: 'step', data: 'x' }, { type: 'other' }, [1], 'str', 5, null, { type: 'step', data: { type: 'tool_call', data: 5 } }]));
  }
  let text = chance(0.5) ? '{not json\n' : '';
  for (const r of rows) text += (chance(0.04) ? pick(['garbage {', '', '  ', '\x00\x01']) + '\n' : '') + (typeof r === 'string' ? r : J(r)) + pick(['\n', '\n', '\n', '\r\n']);
  if (chance(0.15)) text = text.slice(0, -1);
  return text;
}

const CONVS = ['22222222-3333-4444-5555-666666666666', 'c-1', 'conv_x'];
function scenarioPlatform() {
  const conv = pick(CONVS);
  const layout = pick(['share/projects/proj', 'proj/.scaffolding', 'x/y/z']);
  const base = layout.endsWith('.scaffolding') ? `${layout}/conversations/${conv}` : `${layout}/conversations/${conv}`;
  const runs = many(1 + int(3), (_, i) => pick(['run-aaaa', 'r' + i, 'bad run', 'ok.1']));
  const invoked = [];
  for (const run of new Set(runs)) {
    writeBoth(`${base}/tasks/${run}/output.jsonl`, platformStream());
    const args = ['platform', '--task-dir', `@S@/${base}/tasks/${run}`, '--conv-dir', `@S@/${base}`];
    if (chance(0.4)) args.push('--force');
    if (chance(0.3)) args.push('--agent', pick(['scaffolding:builder', 'x', 'bad agent', '', str().slice(0, 30)]));
    invoked.push(args);
    if (chance(0.3)) invoked.push(args);
  }
  invoked.push(['render', '--conv-dir', `@S@/${base}`]);
  return { invoked, env: {} };
}

function localRows(sid, n, start = 0) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const tool = toolName();
    const id = chance(0.9) ? `u${start + i}` : ident();
    const t = pick([`2026-10-21T10:${String(int(60)).padStart(2, '0')}:00.${100 + int(900)}Z`, ts()]);
    const blocks = [{ type: 'tool_use', id, name: tool, input: anyInput(typeof tool === 'string' ? tool : 'Bash') }];
    if (chance(0.2)) blocks.unshift({ type: 'text', text: str() }, 'x');
    rows.push({ type: 'assistant', timestamp: t, sessionId: sid, message: { content: blocks } });
    if (chance(0.8)) rows.push({ type: 'user', timestamp: t, message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: pick([true, false, false, 'yes', 1, null]), content: str() }] } });
    if (chance(0.1)) rows.push(pick([{ type: 'summary' }, { message: 'x' }, { message: { content: 'x' } }, [1], 'tool_use', 5]));
  }
  return rows;
}
const jl = (rows) => rows.map((r) => (typeof r === 'string' ? r : J(r)) + pick(['\n', '\n', '\n', '\r\n'])).join('');

function scenarioLocal() {
  const sid = pick(['11111111-2222-3333-4444-555555555555', 'abcdefgh', 'sess-1234']);
  const conv = `@S@/repo/.scaffolding/conversations/${sid}`;
  const tp = `cc/${sid}.jsonl`;
  writeBoth(tp, jl(localRows(sid, int(25))));
  const subs = many(int(3), (_, i) => `cc/${sid}/subagents/agent-${pick(['a', 'b', 'c'])}${i}`);
  for (const s of subs) {
    writeBoth(`${s}.jsonl`, jl(localRows(sid, 1 + int(6), 100)));
    if (chance(0.7)) writeBoth(`${s}.meta.json`, chance(0.85) ? J({ agentType: pick(['scaffolding:debugger', 'x y', null, 5, 'rev']), toolUseId: pick(['t1', 'bad id', null, 5]) }) : pick(['{broken', '[1]', '5', '']));
  }
  const invoked = [];
  const pass = (final) => {
    invoked.push(['local', '--transcript', `@S@/${tp}`, '--session-id', pick([sid, sid, sid, 'bad id']), '--conv-dir', conv, ...(chance(0.7) ? ['--project-dir', '@S@/repo'] : []), ...(final ? ['--final'] : [])]);
    if (chance(0.5)) invoked.push(['render', '--conv-dir', conv]);
  };
  pass(false);
  const appends = int(3);
  for (let i = 0; i < appends; i++) {
    invoked.push({ append: tp, data: jl(localRows(sid, 1 + int(8), 1000 * (i + 1))) + (chance(0.2) ? J(localRows(sid, 1)[0]).slice(0, 30) : '') });
    pass(false);
  }
  if (chance(0.5)) pass(true);
  if (chance(0.15)) invoked.splice(1, 0, { raw: `${conv.replace('@S@/', '')}/actions/.cursor.json`, data: pick(['{broken', '[]', '{"files": 5}', '{"seq": "x"}', '{"pending": []}', '{"seq":"3","count":2.5,"bytes":true,"truncated":1,"files":{},"pending":{}}', '']) });
  return { invoked, env: chance(0.3) ? { CLAUDE_PROJECT_DIR: '@S@/repo' } : {} };
}

const rec = (run, k) => {
  const r = { v: 1, ts: pick([`2026-10-2${k % 9}T10:${String(k % 60).padStart(2, '0')}:00.000Z`, ts(), null, 5]), src: 'platform', conv: 'c', run: chance(0.95) ? run : pick([null, '', 5]), repo: pick(['proj', 'żółw', null, 5]), agent: pick(['main', 'dev', '', null, 'x'.repeat(30)]), seq: k, id: `i${k}`,
    tool: pick(['Bash', 'Edit', 'Read', 'mcp__x__y', 'Task', null, 5]), kind: pick(['exec', 'edit', 'read', 'mcp', 'agent', 'search', 'web', 'other', null, ['a']]), target: pick([`cmd ${k}`, `file-${k % 5}`, str(), null, '', 5, `deploy ${k}`, `abc${k}def0123456`]), status: pick(['ok', 'error', 'error', 'unknown', null, 'weird'])};
  if (chance(0.1)) delete r.target;
  if (chance(0.05)) delete r.status;
  return r;
};
function scenarioRender() {
  const conv = 'x/conversations/' + pick(CONVS);
  const nRuns = 1 + int(14);
  for (let i = 0; i < nRuns; i++) {
    const run = `run-${String(i).padStart(2, '0')}${chance(0.1) ? 'ą' : ''}`;
    const rows = many(1 + int(25), (_, k) => (chance(0.97) ? rec(run, i * 30 + k) : pick([[1], 'x', null, 5, { end: 0 }])));
    if (chance(0.6)) rows.push({ v: 1, run, end: pick([true, true, 1, false]), status: pick(['completed', 'failed', 'cancelled', 'unknown', null, 5]), calls: 1, errors: 0, truncated: 0 });
    const text = jl(rows) .replace(/\r\n/g, chance(0.9) ? '\n' : '\r\n');
    const name = `${conv}/actions/${run}.jsonl`;
    if (chance(0.2)) writeBoth(`${name}.gz`, zlib.gzipSync(Buffer.from(text)));
    else if (chance(0.03)) writeBoth(`${name}.gz`, Buffer.from('not gzip'));
    else if (chance(0.03)) writeBoth(name, Buffer.concat([Buffer.from(text), Buffer.from([0xff, 0x0a])]));
    else writeBoth(name, text);
  }
  if (chance(0.3)) writeBoth(`${conv}/actions/.cursor.json`, '{"seq":1}');
  return { invoked: [['render', '--conv-dir', `@S@/${conv}${chance(0.2) ? '/' : ''}`]], env: {} };
}

const OPTS = ['--task-dir', '--conv-dir', '--transcript', '--session-id', '--project-dir', '--agent', '--force', '--final', '-h', '--help', '--task', '--conv', '--for', '--f', '--s', '-x', '--', 'x', '-5', 'a b', '-a b', '--conv-dir=x', '--zz', '--final=1', '-hh', '', '-'];
function scenarioArgv() {
  const cmd = pick(['platform', 'local', 'render', 'backfill', 'pla', 'bogus', '', '-h']);
  return { invoked: [[cmd, ...many(int(7), () => pick(OPTS.map((o) => (o.startsWith('--conv-dir=') ? `--conv-dir=@S@/c` : o))))].filter((x, i) => i > 0 || x !== '')], env: {} };
}
function scenarioBackfill() {
  for (let i = 0; i < 1 + int(3); i++) writeBoth(`root/p${i}/conversations/${pick(CONVS)}/tasks/${pick(['r1', 'r2', 'bad run'])}/output.jsonl`, platformStream());
  if (chance(0.3)) writeBoth('root/zfile', 'x');
  return { invoked: [['backfill', '@S@/root'], ...(chance(0.3) ? [['backfill', '@S@/root']] : [])], env: {} };
}

function execScenario(sc) {
  const res = { py: [], js: [] };
  for (const step of sc.invoked) {
    if (!Array.isArray(step)) {
      writeBoth(step.raw ?? step.append, ''); // ensure dir exists (keeps existing content for append below)
      for (const side of ['py', 'js']) {
        const f = path.join(SB[side], step.raw ?? step.append);
        if (step.raw) fs.writeFileSync(f, step.data);
        else fs.appendFileSync(f, step.data);
      }
      continue;
    }
    for (const side of ['py', 'js']) res[side].push(run(side, step, sc.env));
  }
  return res;
}

function compareScenario(label, sc) {
  const res = execScenario(sc);
  const a = JSON.stringify({ r: res.py, t: tree('py') });
  const b = JSON.stringify({ r: res.js, t: tree('js') });
  if (a !== b) {
    failures++;
    if (failures <= 15) {
      const ta = tree('py');
      const tb = tree('js');
      const firstDiff = ta.find((x, i) => x !== tb[i]) ?? tb.find((x, i) => x !== ta[i]);
      console.log(`DIFF ${label}\n  steps: ${JSON.stringify(sc.invoked).slice(0, 300)}\n  results py: ${JSON.stringify(res.py).slice(0, 500)}\n  results js: ${JSON.stringify(res.js).slice(0, 500)}\n  first tree diff: ${String(firstDiff).slice(0, 500)}`);
      if (argv.includes('--keep')) fs.cpSync(ROOT, `${ROOT}-fail-${failures}`, { recursive: true });
    }
  }
}

await stringsPart();
const KINDS = [['platform', scenarioPlatform, 4], ['local', scenarioLocal, 4], ['render', scenarioRender, 3], ['argv', scenarioArgv, 2], ['backfill', scenarioBackfill, 1]];
const counts = {};
for (let i = 0; i < N; i++) {
  reset();
  let r = int(14);
  const [name, fn] = KINDS.find(([, , w]) => (r -= w) < 0) ?? KINDS[0];
  counts[name] = (counts[name] ?? 0) + 1;
  compareScenario(`${name} #${i}`, fn());
}
console.log(`scenarios: ${N} (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}), total inputs ${NS + N}, ${failures} differences`);
if (!argv.includes('--keep')) fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
