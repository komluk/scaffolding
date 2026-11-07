#!/usr/bin/env node
// Differential fuzz: the python refactor-guard (v2.34.0) against the node port, through their .sh shims.
//
//   node fuzz-refactor-guard.mjs --old DIR_WITH_PYTHON_HOOKS [--new HOOKS_DIR] [--n 1500] [--seed 1] [--keep]
//
// --old is a checkout of the pre-port plugin (e.g. `git archive v2.34.0 | tar -x -C /tmp/old`; point at its hooks/ dir).
// Every input is run through both shims in the same workspace with the same environment; exit code, stdout and
// stderr must be byte-identical. The one allowed difference is python's own non-determinism: the order in which it
// lists several renamed symbols of one file comes from a `set` (hash-randomised per process), so a pair of outputs
// that only differ in that order is counted separately as "set-order" (the port sorts by code point instead).
// Exit 1 on any real difference. Needs python3 on PATH for the OLD side only.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const OLD = path.resolve(opt('--old', ''));
const NEW = path.resolve(opt('--new', path.join(here, '../../../hooks')));
const N = Number(opt('--n', 1500));
const SEED = Number(opt('--seed', 1));
if (!opt('--old') || !fs.existsSync(path.join(OLD, 'refactor-guard.sh'))) {
  console.error('usage: fuzz-refactor-guard.mjs --old <python hooks dir> [--new <hooks dir>] [--n N] [--seed S]');
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

// ---------------------------------------------------------------- workspace
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-fuzz-'));
const files = {
  'src/a.ts': 'export function foo() {}\nexport const bar = 1;\nfunction localThing() {}\n',
  'src/b.ts': 'export class Widget {}\nexport interface Opts {}\nexport type Id = string;\nexport default async function main() {}\n',
  'src/u.ts': 'export function zażółć() {}\nexport const $store = 1;\nexport const naïve = 2;\n',
  'src/use.ts': 'import { foo } from "./a";\nfoo();\n',
  'src/m.py': 'def keep():\n    pass\nasync def aio():\n    pass\nclass Kls:\n    def inner(self): pass\ndef _priv(): pass\n',
  'src/lib.go': 'package lib\n\nfunc Serve() {}\nfunc (s *T) Method() {}\ntype Config struct{}\nconst Max = 1\nvar Dflt = 2\nfunc private() {}\n',
  'src/lib.rs': 'pub fn run() {}\npub(crate) struct Inner;\npub async unsafe fn go() {}\nfn hidden() {}\n',
  'src/Svc.cs': 'public class Svc {}\npublic static partial class Util {}\ninternal class Hidden {}\n',
  'src/Svc.java': 'public class Svc {}\npublic interface Api {}\n',
  'src/Svc.kt': 'public enum Mode {}\n',
  'src/crlf.ts': 'export function crlfFn() {}\r\nexport const crlfConst = 1;\r\n',
  'src/a.test.ts': 'export function foo() {}\n',
  'tests/helper.ts': 'export function helperFn() {}\n',
  'node_modules/x/ignored.ts': 'export function foo() {}\n',
  'dist/gen.ts': 'export function foo() {}\n',
  'NOTES.md': 'foo bar Widget\n',
  'src/dup1.ts': 'export const dupSym = 1;\n',
  'src/sub/dup2.ts': 'export const dupSym = 2;\n',
};
for (const [f, c] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(W, f)), { recursive: true });
  fs.writeFileSync(path.join(W, f), c);
}
fs.writeFileSync(path.join(W, 'src/bad.ts'), Buffer.from('export function bad\xff() {}\nexport function good() {}\n', 'latin1'));
const T = path.join(W, 'tr');
fs.mkdirSync(T);

// ---------------------------------------------------------------- generators
const abs = (f) => path.join(W, f);
const CODE = Object.keys(files).filter((f) => /\.(ts|py|go|rs|cs|java|kt)$/.test(f));
const IDENTS = ['foo', 'bar', 'Widget', 'Opts', 'Id', 'main', 'zażółć', '$store', 'naïve', 'keep', 'aio', 'Kls', 'Serve', 'Method', 'Config', 'Max', 'Dflt', 'run', 'Inner', 'go', 'Svc', 'Util', 'Api', 'Mode', 'dupSym', 'helperFn', 'localThing', 'crlfFn', 'good', 'nope', 'x1', 'A', 'inner'];
const DECLS = [
  'export function foo() {}', 'export const bar = 1;', 'export class Widget {}', 'export interface Opts {}', 'export type Id = string;',
  'export default async function main() {}', 'export function* gen() {}', 'export declare abstract class Base {}', 'export enum E {}',
  'export let l = 1;', 'export var v = 2;', 'function localThing() {}', 'const q = 1;', '// export const c = 1;',
  'def keep():', 'async def aio():', 'class Kls:', 'def _priv():', 'func Serve() {}', 'func (s *T) Method() {}', 'type Config struct{}',
  'const Max = 1', 'var Dflt = 2', 'func private() {}', 'pub fn run() {}', 'pub(crate) struct Inner;', 'pub async unsafe fn go() {}',
  'public class Svc {}', 'public static partial class Util {}', 'public interface Api {}', 'public enum Mode {}', 'internal class Hidden {}',
  'export const zażółć = 1;', 'export const $x = 1;', '  export   const   sp   =   1;', '\texport\ttype\tTb = 1;', 'export const\u00a0nb = 1;',
  'export const\x1cfs = 1;', 'x\u2028export const ls = 1;', 'x\rexport const cr = 1;', 'export function crlfFn() {}\r\nexport const crlfConst = 1;', '',
];
const POOL = {
  ts: DECLS.slice(0, 14).concat(DECLS.slice(32, 42)),
  py: DECLS.slice(14, 17),
  go: DECLS.slice(17, 24),
  rs: DECLS.slice(24, 27),
  cs: DECLS.slice(27, 32),
};
const poolFor = (file) => {
  const ext = path.extname(file);
  const k = ext === '.py' ? 'py' : ext === '.go' ? 'go' : ext === '.rs' ? 'rs' : ['.cs', '.java', '.kt'].includes(ext) ? 'cs' : 'ts';
  return chance(0.85) ? POOL[k] : DECLS;
};
const mutate = (s) => {
  const r = int(12);
  if (r === 0) return s.replace(/export/, 'export  ');
  if (r === 1) return s.replace(/foo|Widget|keep|Serve|run|Svc/, (m) => `${m}2`);
  if (r === 2) return s.replace(/ /g, '\u00a0');
  if (r === 3) return `${s}\n${pick(DECLS)}`;
  if (r === 4) return '';
  if (r === 5) return s.toUpperCase();
  if (r === 6) return s.replace(/\n/g, '\r\n');
  return s;
};
const sedFlag = () => pick(['-i', '-i', '-i', '-i.bak', "-i ''", '--in-place', '--in-place=.bak', '-ie', '-Ei', '-n', '-s -i', '-pi', '-ni']);
const anchors = (id) => pick([id, id, `\\b${id}\\b`, `\\<${id}\\>`, `^${id}$`, `\\(${id}\\)`, `\\b${id}`, `${id}\\b`]);
const delim = () => pick(['/', '/', '/', '|', '#', ',', '@', ':', 'x', ' ', '\\']);
const subst = () => {
  const d = delim();
  const id = pick(IDENTS);
  const nw = pick([`${id}2`, 'Renamed', '', id, 'a b']);
  return `s${d}${anchors(id)}${d}${nw}${d}${pick(['', 'g', 'gI', 'e'])}`;
};
const fileArg = () => pick([
  ...CODE.map((f) => f), ...CODE.map(abs), 'src/*.ts', 'src/?.ts', 'src/[ab].ts', '*/*.ts', 'src/**/*.ts', 'src/nomatch*.ts', 'NOTES.md', 'src/none.ts',
  '~/a.ts', 'src/a.typescript', './src/a.ts', 'src/../src/a.ts', 'src/[a.ts', 'src/bad.ts', 'src/sub', "'src/a b.ts'", 'src/a.ts\\', '-- -x.ts',
]);
const quote = (s) => pick([`'${s.replace(/'/g, "'\\''")}'`, `'${s.replace(/'/g, "'\\''")}'`, `"${s.replace(/(["\\$`])/g, '\\$1')}"`, s.replace(/([ '"\\$;&|()<>*?[\]])/g, '\\$1')]);
function bashCommand() {
  const tool = pick(['sed', 'sed', 'sed', 'perl', 'gsed', 'echo sed', 'sudo sed']);
  const scripts = Array.from({ length: 1 + (chance(0.15) ? int(3) : 0) }, () => (chance(0.12) ? pick([`/${pick(IDENTS)}/d`, `/^\\s*\\b${pick(IDENTS)}\\b.*/d`, `/^${pick(IDENTS)}/d`]) : subst()));
  const fl = tool.includes('perl') ? pick(['-pi -e', '-i -pe', '-pi.bak -e', '-0pi -e', '-pe', '-pie']) : sedFlag();
  const sc = scripts.map((s) => (tool.includes('perl') || scripts.length > 1 ? `${tool.includes('perl') ? '' : '-e '}${quote(s)}` : quote(s)));
  const nf = int(4);
  const fa = Array.from({ length: nf }, () => (chance(0.9) ? fileArg() : pick(['$(echo x)', '`ls`', '$(grep -rl foo src)'])));
  let cmd = `${tool} ${fl} ${sc.join(' ')} ${fa.join(' ')}`.replace(/\s+$/, '');
  const shape = int(14);
  if (shape === 0) cmd = `grep -rl ${pick(IDENTS)} . | xargs ${cmd.replace(/ (src|\.\/|\*)\S*/g, '')}`;
  else if (shape === 1) cmd = `${cmd} $(grep -rl ${pick(IDENTS)} src)`;
  else if (shape === 2) cmd = `find . -name '*.ts' -print0 | xargs -0 ${cmd}`;
  else if (shape === 3) cmd = `cd src && ${cmd} && echo done`;
  else if (shape === 4) cmd = `${cmd} # ${pick(IDENTS)}`;
  else if (shape === 5) cmd = cmd.replace(/'/, '').replace(/"/, '');
  else if (shape === 6) cmd = cmd.replace(/ /g, pick(['\t', '\n', '  ', '\u00a0', '\x1c']));
  else if (shape === 7) cmd = `${cmd} \\\n ${fileArg()}`;
  else if (shape === 8) cmd = `FOO=1 ${cmd}; ${cmd}`;
  else if (shape === 9) cmd = `${cmd}\n`;
  return cmd;
}

function toolPayload() {
  const r = int(100);
  if (r < 38) {
    const f = pick(CODE);
    const decl = pick(poolFor(f));
    return { tool_name: 'Edit', tool_input: { file_path: chance(0.9) ? abs(f) : f, old_string: chance(0.9) ? decl : pick([null, 5, ['x']]), new_string: chance(0.85) ? mutate(decl) : pick([null, '', 7]) } };
  }
  if (r < 48) {
    const f = pick(CODE);
    return { tool_name: 'MultiEdit', tool_input: { file_path: abs(f), edits: chance(0.9) ? Array.from({ length: int(4) }, () => { const d = pick(poolFor(f)); return chance(0.92) ? { old_string: d, new_string: mutate(d) } : pick([{}, 1, null, { old_string: null }]); }) : pick([null, 'x', {}, 5]) } };
  }
  if (r < 62) {
    const f = pick(CODE.concat(['src/new.ts', 'src/bad.ts', 'README.md']));
    return { tool_name: 'Write', tool_input: { file_path: abs(f), content: chance(0.9) ? Array.from({ length: int(4) }, () => pick(poolFor(f))).join('\n') : pick([null, 5, '']) } };
  }
  if (r < 96) return { tool_name: 'Bash', tool_input: { command: chance(0.97) ? bashCommand() : pick([null, 5, ['sed'], '']) } };
  return { tool_name: pick(['Read', 'Task', '', null, 7]), tool_input: pick([{}, null, 'x', [1], { file_path: abs('src/a.ts') }]) };
}

const useBlock = (name, input, id) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', ...(id === undefined ? {} : { id }), name, input }] } });
const resBlock = (id, content, isError) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, ...(isError === undefined ? {} : { is_error: isError }), content }] } });
const ERR_TEXTS = ['Error: x', '  Error: y', 'Errors found', 'Error_x', 'Found 10 references', 'connection got disposed', 'make sure a server is running', '[{"type":"text","text":"Error: z"}]', '', 'error: lower'];
function transcriptLines() {
  const lines = [];
  const n = int(6);
  for (let i = 0; i < n; i++) {
    const id = chance(0.8) ? `id${i}` : undefined;
    const f = chance(0.7) ? abs(pick(CODE)) : pick(['src/a.ts', './src/a.ts', 'a.ts', '../x/src/b.ts', 'src/lib.go', 'src/m.py', 5, '']);
    const kind = int(10);
    if (kind < 5) lines.push(useBlock('LSP', { operation: pick(['findReferences', 'findReferences', 'incomingCalls', 'hover', 'goToDefinition', ['x'], undefined]), filePath: f, line: 1, character: 1 }, id));
    else if (kind < 8) lines.push(useBlock(`mcp__graphify__${pick(['query_graph', 'get_node', 'get_neighbors', 'god_nodes', 'shortest_path'])}`, pick([{ q: pick(IDENTS) }, { question: `who uses ${pick(IDENTS)}?` }, { a: [{ b: pick(IDENTS) }] }, null, 'foo']), id));
    else if (kind === 8) lines.push('this is not json but mentions findReferences');
    else lines.push(useBlock(pick(['Read', 'lsp', 'Bash', 5]), {}, id));
    if (id !== undefined && chance(0.55)) {
      const r = int(4);
      const t = pick(ERR_TEXTS);
      lines.push(r === 0 ? resBlock(id, t, pick([true, false, undefined])) : r === 1 ? resBlock(id, [{ type: 'text', text: t }], pick([true, false, undefined])) : r === 2 ? resBlock(id, pick([null, 42, { e: t }]), undefined) : resBlock(id, t, pick([false, undefined, true])));
    }
  }
  return lines;
}
function writeTranscript(i) {
  const main = path.join(T, `t${i}.jsonl`);
  const kind = int(12);
  if (kind === 0) return path.join(T, `missing${i}.jsonl`);
  if (kind === 1) return '';
  const lines = transcriptLines();
  fs.writeFileSync(main, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join(pick(['\n', '\n', '\r\n'])) + (chance(0.8) ? '\n' : ''));
  if (kind >= 8) {
    const dir = path.join(T, `t${i}`, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    for (let k = 0; k < 1 + int(chance(0.1) ? 11 : 3); k++) {
      const p = path.join(dir, `agent-${k}.jsonl`);
      fs.writeFileSync(p, transcriptLines().map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
      fs.utimesSync(p, 1700000000 + k * 7 + (chance(0.3) ? 0 : int(100)), 1700000000 + k * 7 + (chance(0.3) ? 0 : int(100)));
    }
  }
  return main;
}

function makeCase(i) {
  const p = toolPayload();
  const payload = { ...p, cwd: chance(0.85) ? W : pick([`${W}/src`, '', null, `${W}/gone`, 7]), transcript_path: writeTranscript(i) };
  if (chance(0.03)) delete payload.cwd;
  if (chance(0.03)) delete payload.transcript_path;
  let stdin = JSON.stringify(payload);
  const r = int(100);
  if (r < 3) stdin = stdin.slice(0, int(stdin.length));
  else if (r < 5) stdin = `\ufeff${stdin}`;
  else if (r < 7) stdin = stdin.replace(/\}$/, ',"x":NaN}');
  else if (r < 8) stdin = ` \n${stdin}\n `;
  else if (r < 9) stdin = pick(['', '[]', 'null', '"x"', '{', '{"tool_name":"Bash"']);
  const env = {};
  const m = int(10);
  if (m < 6) env.SCAFFOLDING_REFACTOR_GUARD = 'deny';
  else if (m < 8) env.SCAFFOLDING_REFACTOR_GUARD = 'warn';
  else if (m === 8) env.SCAFFOLDING_REFACTOR_GUARD = pick(['off', '', 'WARN', 'x']);
  const l = int(10);
  if (l < 5) env.REFACTOR_GUARD_LSP = 'on';
  else if (l < 7) env.REFACTOR_GUARD_LSP = 'off';
  else if (l === 7) env.REFACTOR_GUARD_LSP = 'maybe';
  return { stdin, env };
}

// ---------------------------------------------------------------- run
const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: 'C.UTF-8', TZ: 'UTC' };
function runShim(dir, c) {
  const r = spawnSync('bash', [path.join(dir, 'refactor-guard.sh')], { cwd: W, env: { ...baseEnv, ...c.env }, input: Buffer.from(c.stdin, 'utf8'), timeout: 20000 });
  return { code: r.status, out: r.stdout.toString('latin1'), err: r.stderr.toString('latin1') };
}
// "refactor-guard BLOCKED: ... exported `a`, `b` (defined in F) ... line=N, character=M" -> sort the symbol list, drop the located position
const reorder = (s) => s.replace(/(exported )((?:\\?`[^`]*\\?`(?:, )?)+)/, (_, a, list) => a + list.split(', ').sort().join(', ')).replace(/\(defined in [^)]*\)/, '(defined in *)').replace(/filePath=\\"[^"]*\\", line=\d+, character=\d+/, 'filePath=*');

let same = 0;
let setOrder = 0;
const real = [];
const kinds = { deny: 0, warn: 0, silent: 0 };
const byTool = {};
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const c = makeCase(i);
  const a = runShim(OLD, c);
  const b = runShim(NEW, c);
  {
    let tn = '?';
    try { tn = JSON.parse(c.stdin).tool_name ?? '?'; } catch { tn = 'unparsable'; }
    const o = (byTool[tn] ??= { n: 0, out: 0 });
    o.n++;
    if (b.out) o.out++;
  }
  if (b.out.includes('permissionDecision')) kinds.deny++;
  else if (b.out.includes('additionalContext')) kinds.warn++;
  else kinds.silent++;
  if (a.code === b.code && a.out === b.out && a.err === b.err) same++;
  else if (a.code === b.code && a.err === b.err && reorder(a.out) === reorder(b.out)) setOrder++;
  else real.push({ i, c, a, b });
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`inputs=${N} seed=${SEED} identical=${same} set-order-only=${setOrder} DIFFERENT=${real.length}  (deny=${kinds.deny} warn=${kinds.warn} silent=${kinds.silent}, ${secs}s)`);
console.log('by tool (inputs / with output):', JSON.stringify(byTool));
for (const d of real.slice(0, 8)) {
  console.log(`--- input #${d.i}\nenv=${JSON.stringify(d.c.env)}\nstdin=${d.c.stdin.slice(0, 600)}`);
  console.log(`old: code=${d.a.code} out=${d.a.out.slice(0, 500)} err=${d.a.err.slice(0, 200)}`);
  console.log(`new: code=${d.b.code} out=${d.b.out.slice(0, 500)} err=${d.b.err.slice(0, 200)}`);
}
if (!argv.includes('--keep')) fs.rmSync(W, { recursive: true, force: true });
else console.log('workspace kept at', W);
process.exit(real.length === 0 ? 0 : 1);
