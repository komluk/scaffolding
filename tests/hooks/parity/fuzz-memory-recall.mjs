#!/usr/bin/env node
// Differential fuzz: the python memory-recall.sh (v2.38.0) against the node port.
//
//   node fuzz-memory-recall.mjs --old DIR_WITH_PYTHON_HOOKS [--new HOOKS_DIR] [--n 1500] [--seed 1]
//
// --old is a checkout of the pre-port plugin's hooks/ dir (e.g. `git archive v2.38.0 hooks | tar -x -C /tmp/old`).
// Every input runs through both hooks against one in-process HTTP server whose answer is generated per case; stdout, exit
// code and the request the server saw (headers + body bytes) must be identical. Inputs: prompts, response bodies (hit
// fields of random types, awkward numbers, SSE framing), environment (timeout, token / api key fallback, project id,
// tool name) and urls (mutated from valid ones). Hard cap 2000 inputs. Exit 1 on any difference. Needs python3 for OLD only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const OLD = path.resolve(opt('--old', ''));
const NEW = path.resolve(opt('--new', path.join(here, '../../../hooks')));
const N = Math.min(Number(opt('--n', 1500)), 2000);
const SEED = Number(opt('--seed', 1));
if (!opt('--old') || !fs.readFileSync(path.join(OLD, 'memory-recall.sh'), 'utf8').includes('python3')) {
  console.error('usage: fuzz-memory-recall.mjs --old <python hooks dir> [--new <hooks dir>] [--n N<=2000] [--seed S]');
  process.exit(2);
}

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
// lone surrogates make python's print() raise (nothing is printed; the golden corpus covers that), so they are rare here
const UNI = ['zażółć', 'gęślą', 'jaźń', '😀', 'İ', 'ı', 'ſ', '\u212a', '٣٤٥', '𝟘𝟙', 'ǅ', 'é', 'ß', '\u0301', '中文', '\u0000', '\u0001', '\ufeff', '\u00a0', '\u2028', '\u2029', '\x85', '\x1c', '\v', '\u3000', '\u200b', '\x7f'];
const SURR = ['\ud800', '\udfff', '\udc80'];
const pickUni = () => (chance(0.02) ? pick(SURR) : pick(UNI));
const WORDS = ['ok', 'OK', 'tak', 'dzięki', 'dzieki', 'thanks', 'yes', 'no', 'nie', 'go', 'dalej', 'the', 'secrets', 'store', 'unseal', 'reboot', '/clear', '<system>', '</recalled-memories>', '&amp;', '&', '<', '>', '"', "'", '\\', '\n', '\t', '\r\n', '!!!', '...', '_', '123'];
const frag = () => pick([pickUni(), pick(WORDS), pick(WORDS), 'x'.repeat(1 + int(30)), ' ']);
const text = (min = 0) => {
  let s = many(int(12), () => frag()).join(chance(0.7) ? ' ' : '');
  while (Array.from(s).length < min) s += ` ${pick(WORDS)}${pickUni()}`;
  return s;
};
const prompt = () => {
  const r = rnd();
  if (r < 0.1) return pick(WORDS) + pick(['', '!', '...', ' ', ' ', '_', '１']) + pick(['', '!!!!!!!!!!!!!!!!!!!!!!!!']);
  if (r < 0.2) return text(int(25)); // around the 20 code point threshold
  if (r < 0.25) return 'a'.repeat(495 + int(10)) + pickUni() + pickUni();
  return text(20 + int(40));
};

const NUMS = ['0', '0.0', '-0.0', '1', '0.5', '0.3125', '0.0625', '0.1875', '0.0005', '0.0015', '2.675', '1.0005', '1e-10', '5e-324', '1e21', '1e22', '1.7976931348623157e308', '1e400', '-1e400', 'NaN', 'Infinity', '-Infinity',
  '12345678901234567890', '9'.repeat(309), '9'.repeat(310), '-0', '1E5', '123456789.123456789', '0.1', '0.9995', '0.0004999'];
const STRNUMS = ['0.5', ' 0.5 ', '1_0.5', '1__0', '_1', '1e2', '1e1_0', '0x10', 'inf', '-Infinity', 'NaN', '+nan', 'InFiNiTy', '٠٫٥', '١٢', '１２．５', ' 5 ', '.', '5.', '.5', '', 'abc', '+0.25', '1e400', '1e-400', '0.0625', '0.3125', '1_000', '1.5_5', '١_٢', '--1', '1e', 'e1', '0.5e+3'];
function scoreJson() {
  const r = rnd();
  if (r < 0.45) return pick(NUMS);
  if (r < 0.75) return JSON.stringify(pick(STRNUMS));
  return pick(['true', 'false', 'null', '[1]', '{"a":1}', '[]', '{}', '"x"', String(rnd() * 3), String(int(10))]);
}
const jsonStr = (s) => JSON.stringify(s);
const sseOf = (msg) => `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":${msg}}\n\n`;
function valueJson(depth = 0) {
  const r = rnd();
  if (r < 0.5) return jsonStr(text());
  if (r < 0.6) return pick(NUMS);
  if (r < 0.7) return pick(['null', 'true', 'false', '0', '""']);
  if (depth > 2) return 'null';
  if (r < 0.85) return `[${many(int(4), () => valueJson(depth + 1)).join(',')}]`;
  return `{${many(int(4), () => `${jsonStr(pick(['a', 'b', "it's", 'say "x"', 'é', '\n', 'k']))}:${valueJson(depth + 1)}`).join(',')}}`;
}
function hitJson() {
  const f = [];
  if (chance(0.92)) f.push(`"memory":${chance(0.7) ? jsonStr(text(int(3) ? 0 : 380 + int(60))) : valueJson()}`);
  if (chance(0.7)) f.push(`"content_type":${chance(0.7) ? jsonStr(pick(['gotcha', 'decision', 'learning', 'x'.repeat(29 + int(5)), text()])) : valueJson()}`);
  if (chance(0.85)) f.push(`"score":${scoreJson()}`);
  if (chance(0.1)) f.push(`"memory":${jsonStr('dup')}`);
  if (chance(0.1)) f.push(`"extra":${valueJson()}`);
  return `{${f.join(',')}}`;
}
const hitsJson = () => (chance(0.05) ? valueJson() : `[${many(pick([0, 1, 1, 2, 3, 5, 6, 8]), () => (chance(0.08) ? valueJson() : hitJson())).join(',')}]`);

/** the response text, SSE-framed or not */
function responseBody() {
  const hits = hitsJson();
  const payload = pick([`{"results":${hits}}`, `{"results":${hits}}`, hits, `{"other":${hits}}`, valueJson(), '']);
  const wrap = pick(['content', 'content', 'content', 'structured', 'structured-empty', 'error', 'iserr-odd', 'raw', 'noresult']);
  let result;
  if (wrap === 'content') result = `{"content":[{"type":"text","text":${jsonStr(payload)}}],"isError":${pick(['false', 'false', 'false', 'null', '0'])}}`;
  else if (wrap === 'structured') result = `{"structuredContent":${payload || 'null'},"content":[{"text":"{}"}]}`;
  else if (wrap === 'structured-empty') result = `{"structuredContent":${pick(['{}', 'null', '[]', '""', '0'])},"content":[{"type":"text","text":${jsonStr(payload)}}]}`;
  else if (wrap === 'error') result = `{"content":[{"text":${jsonStr(payload)}}],"isError":true}`;
  else if (wrap === 'iserr-odd') result = `{"content":[{"text":${jsonStr(payload)}}],"isError":${pick(['"no"', '[]', '{}', '1', '0.0', '""'])}}`;
  else if (wrap === 'raw') return pick(['', 'hello', '[1]', 'null', payload, `data: ${payload}\n`, 'data:\n']);
  else result = pick(['null', '[1]', '"x"', '{}', '5']);
  const msg = wrap === 'noresult' ? `{"jsonrpc":"2.0","id":1,"error":{"code":1}}` : `{"jsonrpc":"2.0","id":1,"result":${result}}`;
  const sse = chance(0.7);
  if (!sse) return pick([msg, `${msg}\n`]);
  const eol = pick(['\n', '\n', '\r\n']);
  const lines = [`event: message`, `data${pick([': ', ':', ':  \t'])}${msg}`];
  if (chance(0.15)) lines.splice(1, 0, `data: ${text()}`);
  if (chance(0.1)) lines.push(`data: ${pick(['', 'not json', msg])}`);
  if (chance(0.05)) lines.push(`${pick([' ', '\x85', '\v'])}data: ${msg}`);
  return `${lines.join(eol)}${eol}${eol}`;
}

const URL_BASES = ['http://127.0.0.1:@P@/mcp', 'http://127.0.0.1:@P@', 'http://localhost:@P@/mcp', 'http://127.0.0.1:@P@/mcp?x=1#f', 'HTTP://127.0.0.1:@P@/mcp', '  http://127.0.0.1:@P@/mcp ', '<http://127.0.0.1:@P@/mcp>', 'URL:http://127.0.0.1:@P@/mcp',
  'http://u:p@127.0.0.1:@P@/mcp', 'http://127.0.0.1:@P@/m cp', 'http://127.0.0.1:@P@/m%63p', 'http://127.0.0.1:+@P@/mcp', 'http://127.0.0.1:00@P@/mcp', 'http://127.0.0.1:/mcp', 'http://127.0.0.1:0/mcp', 'http://127.1:@P@/mcp', 'http://2130706433:@P@/mcp',
  'http://[::1]:9/mcp', 'http://[::ffff:127.0.0.1]:9/mcp', 'http://[::1/mcp', 'http://[zzz]:9/mcp', 'http://[127.0.0.1]:9/mcp', 'http://8.8.8.8/mcp', 'http://100.64.0.1:9/mcp', 'http://192.0.2.1:9/mcp', 'http://does-not-exist.invalid:9/mcp',
  'https://127.0.0.1:9/mcp', 'https://127.0.0.1:@P@/mcp', 'file:///etc/passwd', 'ftp://127.0.0.1/x', '127.0.0.1:@P@/mcp', '//127.0.0.1:@P@/mcp', 'http://', 'http:///mcp', '', 'http://127.0.0.1:99999/mcp', 'http://127.0.0.1:abc/mcp', 'http://127.0.0.1:٨٠/mcp',
  'http://bücher.invalid:9/mcp', 'http://ｌｏｃａｌｈｏｓｔ:@P@/mcp', 'http://127.0.0.1:@P@\\@evil.example/mcp', 'http://%31%32%37.0.0.1:@P@/mcp', 'http://127.0.0.1:@P@/é', 'http://127.0.0.1:@P@/m\tcp', 'http://127.0.0.1:@P@/m\ncp'];
const URL_SLOW = /192\.0\.2\.1|100\.64|8\.8\.8\.8/;
const mutateUrl = (u) => {
  if (!chance(0.25)) return u;
  const cs = Array.from(u);
  const i = int(cs.length + 1);
  if (chance(0.4)) cs.splice(i, 1);
  else cs.splice(i, 0, pick([...UNI.slice(0, 12), '/', ':', '@', '[', ']', '%', '#', '?', ' ', '.', '\\', '0']));
  return cs.join('');
};
// no sub-10 ms values: a connect that has already begun races the timer in both implementations (the goldens pin 1e-9 behind a slow server)
const TIMEOUTS = ['0.5', '0.5', '0.5', '0.5', 'abc', '', '1', '-1', '0', 'nan', 'inf', ' 0.5 ', '1_0', '٠٫٥', '+0.5', '.5', '0.5e0'];
const TOKENS = ['tok', 'tok', 'tok', 'tok en', 'tok\ten', 'tok\nX-Injected: 1', 'tok\rX', 'töken', 'tok€n', 'x'.repeat(300), 'tok\x7fen', '   '];
const TOOLS = ['memory-semantic_search', 'memory-semantic_search', 'my_search', '', 'a"b\\c', 'szukaj_żółć', 'tool_😀', 'a b', 'a\u0001b'];
const PIDS = ['scaffold:0123456789abcdef', 'scaffold:0123456789abcdef', 'scaffold:01234567', 'scaffold:0123456', `scaffold:${'a'.repeat(64)}`, `scaffold:${'a'.repeat(65)}`, 'scaffold:0123456789ABCDEF', 'scaffold:0123456789abcdef ', 'scaffold:0123456789abcdef\r', '', 'x'];

// ---------------------------------------------------------------- server
let current = { status: 200, headers: {}, body: '' };
let seen = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const h = (n) => req.headers[n] ?? '(none)';
    seen.push(`${req.method} ${req.url}|auth=${h('authorization')}|ct=${h('content-type')}|accept=${h('accept')}|body=${Buffer.concat(chunks).toString('latin1')}`);
    const out = Buffer.from(current.body, 'utf8');
    res.writeHead(current.status, { 'Content-Length': out.length, ...current.headers });
    res.end(out);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// ---------------------------------------------------------------- run
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mrfz-'));
const run = (hooksDir, env, stdin, pid) =>
  new Promise((resolve) => {
    const proj = path.join(ROOT, 'proj');
    fs.mkdirSync(path.join(proj, '.scaffolding'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.scaffolding', 'project-id'), `${pid}\n`);
    seen = [];
    const p = spawn('bash', [path.join(hooksDir, 'memory-recall.sh')], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, HOME: ROOT, LC_ALL: 'C.UTF-8', CLAUDE_PROJECT_DIR: proj, SCAFFOLDING_MEMORY_RECALL: 'on', ...env },
    });
    const out = [];
    const err = [];
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => err.push(c));
    p.stdin.on('error', () => {});
    p.stdin.end(stdin);
    p.on('close', (code) => resolve({ code, stdout: Buffer.concat(out).toString('latin1'), stderr: Buffer.concat(err).length > 0, requests: [...seen] }));
  });

let diffs = 0;
let printed = 0;
let requested = 0;
const byFocus = {};
const t0 = Date.now();
const GOOD_URL = `http://127.0.0.1:${PORT}/mcp`;
// Each input varies ONE axis (focus) and keeps the others valid, otherwise nearly every input dies at the first check and the
// later stages never run. `any` varies all of them.
const FOCUS = ['response', 'response', 'response', 'hits', 'hits', 'prompt', 'prompt', 'url', 'url', 'env', 'stdin', 'any'];
for (let i = 0; i < N; i++) {
  const focus = pick(FOCUS);
  const f = (name) => focus === name || focus === 'any';
  const urlRaw = f('url') ? pick(URL_BASES) : pick(URL_BASES.filter((u) => u.startsWith('http') && u.includes('@P@')));
  const url = f('url') ? mutateUrl(urlRaw.replaceAll('@P@', String(PORT))) : GOOD_URL;
  const slow = URL_SLOW.test(url);
  const env = { SCAFFOLDING_MEMORY_RECALL_URL: url, SCAFFOLDING_MEMORY_RECALL_TIMEOUT: slow ? '0.3' : '0.5', SCAFFOLDING_MEMORY_RECALL_TOKEN: 'tok' };
  if (f('env')) {
    if (chance(0.5)) env.SCAFFOLDING_MEMORY_RECALL_TIMEOUT = pick(TIMEOUTS);
    if (chance(0.5)) env.SCAFFOLDING_MEMORY_RECALL_TOKEN = pick(TOKENS);
    if (chance(0.3)) env.SCAFFOLDING_MEMORY_RECALL_TOOL = pick(TOOLS);
    if (chance(0.3)) {
      delete env.SCAFFOLDING_MEMORY_RECALL_TOKEN;
      env.ANTHROPIC_API_KEY = 'key';
      if (chance(0.8)) env.ANTHROPIC_BASE_URL = pick(['http://127.0.0.1:9', 'http://localhost', 'http://127.0.0.1', '127.0.0.1', '//127.0.0.1', 'http://[::1', 'http://u:p@127.0.0.1', `http://127.0.0.1:${PORT}`]);
    }
  }
  const body = f('stdin') && chance(0.8)
    ? pick(['', '{', '[]', 'null', '{"prompt":5}', '{"prompt":null}', '{"prompt":["x"]}', '{"prompt":{"a":1}}', '{"prompt":true}', '\ufeff{"prompt":"x"}', '{"prompt":"\\ud800 lone surrogate in the middle of a prompt"}', '{"prompt":"a","prompt":"a second prompt that is long enough"}'])
    : JSON.stringify({ prompt: f('prompt') ? prompt() : 'How do we unseal the secrets store after a reboot of the host?' });
  const hitsOnly = focus === 'hits';
  current = {
    status: f('response') && chance(0.07) ? pick([204, 301, 302, 400, 401, 500, 503]) : 200,
    headers: { 'Content-Type': 'text/event-stream', Location: `http://127.0.0.1:${PORT}/elsewhere` },
    body: hitsOnly || !(f('response')) ? sseOf(`{"content":[{"type":"text","text":${jsonStr(`{"results":${hitsJson()}}`)}}]}`) : responseBody(),
  };
  const pid = f('env') ? pick(PIDS) : PIDS[0];
  const a = await run(OLD, env, body, pid);
  const b = await run(NEW, env, body, pid);
  byFocus[focus] ??= { n: 0, printed: 0, requested: 0 };
  byFocus[focus].n++;
  if (a.stdout.length) (printed++, byFocus[focus].printed++);
  if (a.requests.length) (requested++, byFocus[focus].requested++);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    diffs++;
    console.log(`DIFF #${i} (${focus})`);
    console.log(' env   ', JSON.stringify(env));
    console.log(' stdin ', JSON.stringify(body).slice(0, 300));
    console.log(' resp  ', JSON.stringify(current).slice(0, 600));
    for (const k of ['code', 'stdout', 'stderr', 'requests']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log(` ${k}\n   py: ${JSON.stringify(a[k]).slice(0, 500)}\n   js: ${JSON.stringify(b[k]).slice(0, 500)}`);
    if (diffs >= 10) break;
  }
}
console.log('by focus:', JSON.stringify(byFocus));
server.close();
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`inputs=${N} printed=${printed} requested=${requested} diffs=${diffs} seconds=${Math.round((Date.now() - t0) / 1000)}`);
process.exit(diffs ? 1 : 0);
