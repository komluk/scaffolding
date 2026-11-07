#!/usr/bin/env node
// refactor-guard.mjs — core of hooks/refactor-guard.sh (plain ESM, Node >= 22, node: built-ins only).
// Stdin: PreToolUse JSON. Stdout: optional PreToolUse JSON (deny or additionalContext). Always exits 0.
//
// Detects an Edit/MultiEdit/Write (or Bash `sed -i` / `perl -pi`, including file lists coming from `xargs` /
// `$(...)`) that renames or removes an exported symbol, then checks the session transcript for an earlier LSP
// findReferences (on a file defining the symbol) or graphify query (symbol named in its input). If none: DENY
// (default) when an LSP server covers the language, else a warning; SCAFFOLDING_REFACTOR_GUARD=warn keeps
// warn-only, =off disables. Evidence is searched in the session transcript AND its subagents/*.jsonl.
//
// 1:1 port of the python3 refactor_guard.py (v2.34.0): same decisions, messages and silences, including its
// quirks (see "KNOWN GAPS" in CHANGELOG 2.36.0). Anything python would have raised on turns into "no output".
// One deliberate difference: python iterates `symbols(file) & idents` in (randomised) set order, so which of
// several renamed symbols of one file comes first was not reproducible; here it is code point order.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseJson, pyDumps, pyStr, pyTruthy, pySplit, readStdin } from './hook-io.mjs';
import {
  PY_S, PY_W, ShlexError, cmpCp, decodeIgnore, isFile, listdirRaw, pyAbspath, pyGlob, pyJoin, pyMtime, pyNormpath,
  pyReEscape, pyRealpath, pySplitext, pyWhich, readText, shlexSplit, splitlinesPy,
} from './pystd.mjs';

const TAIL = 2 * 1024 * 1024;
const LSP_OPS = new Set(['findReferences', 'incomingCalls']);
const GRAPH_OK = new Set(['query_graph', 'get_node', 'get_neighbors', 'get_community', 'shortest_path', 'get_pr_impact']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.py', '.pyi', '.go', '.rs', '.cs', '.java', '.kt']);
const LANG = { '.ts': 'ts', '.tsx': 'ts', '.js': 'ts', '.jsx': 'ts', '.mts': 'ts', '.cts': 'ts', '.mjs': 'ts', '.cjs': 'ts', '.py': 'py', '.pyi': 'py', '.go': 'go', '.rs': 'rs', '.cs': 'cs', '.java': 'cs', '.kt': 'cs' };

// python `re` with re.M / str patterns, expressed for JS (u flag): ^ = start or after "\n" only; \s \w = python's sets
const S = `[${PY_S}]`;
const SOL = '(?<![^\\n])';
const IDENT = `[A-Za-z_$][${PY_W}$]*`;
const PATTERNS = {
  ts: [`${SOL}${S}*export${S}+(?:default${S}+)?(?:declare${S}+)?(?:abstract${S}+)?(?:async${S}+)?(?:function\\*?|class|const|let|var|type|interface|enum)${S}+(${IDENT})`],
  py: [`${SOL}${S}*(?:async${S}+)?def${S}+([A-Za-z][${PY_W}]*)`, `${SOL}${S}*class${S}+([A-Za-z][${PY_W}]*)`],
  go: [`${SOL}func${S}+(?:\\([^)]*\\)${S}*)?([A-Z][${PY_W}]*)`, `${SOL}type${S}+([A-Z][${PY_W}]*)`, `${SOL}(?:const|var)${S}+([A-Z][${PY_W}]*)`],
  rs: [`${SOL}${S}*pub(?:\\([^)]*\\))?${S}+(?:async${S}+)?(?:unsafe${S}+)?(?:fn|struct|enum|trait|type|const|static|mod)${S}+([${PY_W}]+)`],
  cs: [`${SOL}${S}*public${S}+(?:(?:static|sealed|abstract|partial|async|override|virtual)${S}+)*(?:class|interface|enum|struct|record)${S}+([${PY_W}]+)`],
};
const SCAN = Object.fromEntries(Object.entries(PATTERNS).map(([k, v]) => [k, v.map((p) => new RegExp(p, 'gu'))]));
const ANCHORED = Object.fromEntries(Object.entries(PATTERNS).map(([k, v]) => [k, v.map((p) => new RegExp(p, 'yud'))]));
const TEST_RE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.|_test\.|(^|\/)test_[^/]*$/;
// `s<d>[anchors]OLD[anchors]<d>NEW<d>`; anchors: \b \< \> ^ $ \( \)
const SED_S = new RegExp(`(?<![${PY_W}\\\\])s([^${PY_W}${PY_S}\\\\])(?:\\\\[b<]|\\^|\\\\\\()*(${IDENT})(?:\\\\[b>]|\\$|\\\\\\))*\\1((?:(?!\\1)[^\\n])*)\\1`, 'gu');
const DEL_RE = new RegExp(`^/\\^?${S}*\\\\?s*\\\\?b?([${PY_W}]+)\\\\?b?[^\\n]*/d$`, 'u');
const INPLACE_RE = new RegExp(`^(?:-i[^${PY_S}]*|--in-place[^${PY_S}]*|-[a-zA-Z]*pi[^${PY_S}]*)$`, 'u');
const FILE_TOK = new RegExp(`^[${PY_W}./*?\\[\\]~@+-]+\\.[${PY_W}]{1,6}(?=\\n?$)`, 'u'); // python `$` also matches before a final \n
const EXCL = ['node_modules', '.git', 'dist', 'build'];
const WS_BUDGET = 0.3;

class PyError extends Error {} // anything python would have raised: the whole hook ends silently

// ---- python value helpers (JSON values: Map / Array / BigInt / Number / string / boolean / null)
const need = (cond, what) => {
  if (!cond) throw new PyError(what);
};
const mget = (m, k, dflt = null) => {
  need(m instanceof Map, 'AttributeError: .get');
  return m.has(k) ? m.get(k) : dflt;
};
const or = (v, dflt) => (pyTruthy(v) ? v : dflt);
/** `text or ""` handed to a str-only API (re / join / splitext): a truthy non-str raises */
const strOr = (v) => {
  const s = or(v, '');
  need(typeof s === 'string', 'TypeError: str expected');
  return s;
};
/** hashability + python equality (1 == 1.0 == True) for set membership of JSON scalars */
const hkey = (v) => {
  need(!(v instanceof Map) && !Array.isArray(v), 'TypeError: unhashable');
  if (v === null) return 'n';
  if (typeof v === 'string') return `s${v}`;
  if (v === true) return '#1';
  if (v === false) return '#0';
  if (typeof v === 'bigint') return `#${v}`;
  if (Number.isNaN(v)) return '#nan'; // json.loads hands out one shared NaN object, so nan == nan in a set
  return Number.isInteger(v) ? `#${BigInt(v)}` : `#${v}`; // exact, like python int == float
};
const lstripDotSlash = (s) => s.replace(/^[./]+/, '');
const cpLen = (s) => Array.from(s).length;
const extOf = (f) => pySplitext(f)[1];

function symbols(text, ext) {
  const pats = SCAN[LANG[ext]];
  need(pats, 'KeyError: ext');
  const out = new Set();
  for (const re of pats) for (const m of (text || '').matchAll(re)) out.add(m[1]);
  return out;
}

// ---- LSP coverage
let serversCache;
function lspCovers(ext) {
  const force = process.env.REFACTOR_GUARD_LSP;
  if (force === 'on' || force === 'off') return force === 'on';
  if (serversCache === undefined) {
    const root = process.env.CLAUDE_PLUGIN_ROOT || pyJoin(pyAbspath(path.dirname(process.argv[1] ?? '.')), '..', '..');
    try {
      const doc = parseJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(pyJoin(root, '.claude-plugin', 'plugin.json'))));
      need(doc instanceof Map, 'not a dict');
      serversCache = doc.has('lspServers') ? doc.get('lspServers') : new Map();
    } catch {
      serversCache = false; // unreadable / not JSON / not an object: nothing covered
    }
  }
  if (serversCache === false) return false;
  need(serversCache instanceof Map, 'AttributeError: .values');
  for (const s of serversCache.values()) {
    const map = or(mget(s, 'extensionToLanguage'), new Map());
    let has;
    if (map instanceof Map) has = map.has(ext);
    else if (Array.isArray(map)) has = map.includes(ext);
    else {
      need(typeof map === 'string', 'TypeError: argument of type is not iterable');
      has = map.includes(ext);
    }
    if (has && pyWhich(mget(s, 'command', ''))) return true;
  }
  return false;
}

// ---- transcripts
function tailOf(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return '';
    const start = Math.max(0, st.size - TAIL);
    const buf = Buffer.alloc(st.size - start);
    let got = 0;
    while (got < buf.length) {
      const n = fs.readSync(fd, buf, got, buf.length - got, start + got);
      if (n === 0) break;
      got += n;
    }
    return decodeIgnore(buf.subarray(0, got));
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** The hook's transcript plus its subagents' (<session>/subagents/*.jsonl, 8 newest): inside a subagent the hook may get the PARENT's transcript. */
function transcripts(transcript) {
  const out = transcript ? [transcript] : [];
  if (transcript.endsWith('.jsonl')) {
    const sub = pyJoin(transcript.slice(0, -6), 'subagents');
    try {
      const files = listdirRaw(sub).filter((n) => n.endsWith('.jsonl')).map((n) => pyJoin(sub, n));
      const stamped = files.map((f) => [f, pyMtime(f)]);
      stamped.sort((x, y) => y[1] - x[1]); // stable, newest first, ties keep listdir order (python sort(reverse=True))
      out.push(...stamped.slice(0, 8).map((e) => e[0]));
    } catch {
      /* no subagents dir, or a file vanished: only the main transcript */
    }
  }
  return out;
}

let parsedCache;
/** tool_use blocks and the ids of FAILED tool_results in the transcript tails (a failed call is no evidence) */
function parseTranscripts(transcript) {
  const data = transcripts(transcript).map(tailOf).join('\n');
  if (!data) return null;
  const calls = [];
  const failed = new Set();
  for (const line of splitlinesPy(data)) {
    if (!line.includes('findReferences') && !line.includes('incomingCalls') && !line.includes('mcp__graphify__') && !line.includes('"tool_result"')) continue;
    let msg;
    try {
      const root = parseJson(line);
      need(root instanceof Map, 'not a dict');
      msg = mget(or(root.get('message') ?? null, new Map()), 'content');
    } catch {
      continue;
    }
    for (const b of Array.isArray(msg) ? msg : []) {
      if (!(b instanceof Map)) continue;
      const type = mget(b, 'type');
      if (type === 'tool_result') {
        const c = mget(b, 'content');
        const txt = typeof c === 'string' ? c : pyDumps(c);
        // is_error, or LSP's "Error:" / disposed-connection text. A list-form content is json.dumps'ed WITH spaces
        // ('[{"type": "text", ...'), which the compact-form alternative below never matches (ported as is).
        if (pyTruthy(mget(b, 'is_error')) || new RegExp(`^[${PY_S}]*(?:\\[\\{"type":"text","text":")?[${PY_S}]*Error(?![${PY_W}])`, 'u').test(txt || '') || (txt || '').includes('connection got disposed') || (txt || '').includes('server is running')) {
          failed.add(hkey(mget(b, 'tool_use_id')));
        }
        continue;
      }
      if (type === 'tool_use') calls.push(b);
    }
  }
  return { calls, failed };
}

function evidence(transcript, paths, sym) {
  if (parsedCache === undefined) parsedCache = parseTranscripts(transcript);
  if (!parsedCache) return false;
  const { calls, failed } = parsedCache;
  const real = new Map(); // realpath per distinct filePath: transcripts repeat the same few files thousands of times
  const realOf = (p) => (real.has(p) ? real.get(p) : (real.set(p, pyRealpath(p)), real.get(p)));
  const want = new Set(paths.map(realOf));
  const tails = new Set(paths.map((p) => lstripDotSlash(pyNormpath(p))));
  const word = new RegExp(`(?<![${PY_W}$])${sym.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![${PY_W}$])`, 'u');
  for (const b of calls) {
    if (failed.has(hkey(mget(b, 'id')))) continue;
    const name = mget(b, 'name', '');
    const inp = or(mget(b, 'input'), new Map());
    if (name === 'LSP') {
      const op = mget(inp, 'operation');
      need(!(op instanceof Map) && !Array.isArray(op), 'TypeError: unhashable');
      if (typeof op !== 'string' || !LSP_OPS.has(op)) continue;
      const fp = pyStr(mget(inp, 'filePath', ''));
      if (fp && (want.has(realOf(fp)) || [...want, ...tails].some((w) => w.endsWith(`/${lstripDotSlash(pyNormpath(fp))}`) || w === fp))) return true;
    } else {
      need(typeof name === 'string', 'AttributeError: startswith');
      if (name.startsWith('mcp__graphify__') && GRAPH_OK.has(name.slice(15)) && word.test(pyDumps(inp))) return true;
    }
  }
  return false;
}

// ---- Bash sed/perl renames
function wsDefs(ident, cwd, deadline) {
  const s = pyReEscape(ident);
  const pat = String.raw`export[^;=(]*\b{s}\b|(def|class) +{s}\b|pub(\([^)]*\))? +(async +|unsafe +)?(fn|struct|enum|trait|type|const|static|mod) +{s}\b|func +(\([^)]*\) *)?{s}\b|public .*\b{s}\b`.replaceAll('{s}', s);
  const args = ['-rlEI', ...EXCL.map((e) => `--exclude-dir=${e}`), ...[...CODE_EXT].sort().map((e) => `--include=*${e}`), '-e', pat, '.'];
  const left = deadline - performance.now() / 1000;
  if (left <= 0 || typeof cwd !== 'string') return null;
  const r = spawnSync('grep', args, { cwd, timeout: Math.max(1, Math.ceil(left * 1000)), maxBuffer: Infinity });
  if (r.error) return null; // grep missing, cwd gone, or the budget ran out
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(r.stdout);
  } catch {
    return null;
  }
  const out = [];
  for (const rel of splitlinesPy(text.replace(/\r\n?/g, '\n')).slice(0, 40)) {
    const f = pyAbspath(pyJoin(cwd, rel));
    if (TEST_RE.test(f)) continue;
    try {
      if (symbols(readText(f), extOf(f)).has(ident)) out.push(f);
    } catch {
      /* unreadable / unknown extension */
    }
  }
  return out;
}

function bashTargets(cmd, cwd) {
  need(typeof cmd === 'string', 'shlex: str expected');
  let toks;
  try {
    toks = shlexSplit(cmd);
  } catch (e) {
    if (!(e instanceof ShlexError)) throw e;
    toks = pySplit(cmd);
  }
  if (!toks.some((t) => t === 'sed' || t === 'perl')) return [];
  if (!toks.some((t) => INPLACE_RE.test(t))) return [];
  const idents = new Set();
  for (const t of toks) {
    for (const m of t.matchAll(SED_S)) if (m[2] !== m[3]) idents.add(m[2]);
    const d = DEL_RE.exec(t);
    if (d) idents.add(d[1]);
  }
  if (!idents.size) return [];
  const files = [];
  let noncode = false;
  for (const t of toks.filter((x) => !x.startsWith('-') && FILE_TOK.test(x))) {
    if (CODE_EXT.has(extOf(t))) files.push(...pyGlob(pyJoin(cwd, t)).filter(isFile));
    else noncode = true;
  }
  const dyn = toks.includes('xargs') || cmd.includes('$(') || cmd.includes('`');
  const pairs = [];
  for (const f of files) {
    let text;
    try {
      text = readText(f);
    } catch {
      continue;
    }
    for (const s of [...symbols(text, extOf(f))].filter((x) => idents.has(x)).sort(cmpCp)) pairs.push([[f], s]);
  }
  if (dyn || (!files.length && !noncode)) {
    const deadline = performance.now() / 1000 + WS_BUDGET;
    for (const ident of [...idents].sort(cmpCp)) {
      const defs = wsDefs(ident, cwd, deadline);
      if (defs === null) break;
      if (defs.length) pairs.push([defs, ident]);
    }
  }
  return pairs;
}

/** [[files...], symbol] pairs renamed/removed by this call */
function changedSymbols(tool, ti, cwd) {
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'Write') {
    const f = strOr(mget(ti, 'file_path'));
    const ext = extOf(f);
    if (!CODE_EXT.has(ext)) return [];
    let old;
    let nw;
    if (tool === 'Edit') {
      old = mget(ti, 'old_string', '');
      nw = mget(ti, 'new_string', '');
    } else if (tool === 'MultiEdit') {
      let edits = or(mget(ti, 'edits'), []);
      if (typeof edits === 'string' || edits instanceof Map) edits = [];
      need(Array.isArray(edits), 'TypeError: not iterable');
      const es = edits.filter((e) => e instanceof Map);
      const join = (k) => {
        const vals = es.map((e) => mget(e, k, ''));
        need(vals.every((v) => typeof v === 'string'), 'TypeError: join');
        return vals.join('\n');
      };
      old = join('old_string');
      nw = join('new_string');
    } else {
      try {
        old = readText(f);
      } catch {
        return [];
      }
      nw = mget(ti, 'content', '');
    }
    const a = symbols(strOr(old), ext);
    const b = symbols(strOr(nw), ext);
    return [...a].filter((s) => !b.has(s)).sort(cmpCp).map((s) => [[f], s]);
  }
  if (tool === 'Bash') return bashTargets(mget(ti, 'command', ''), cwd);
  return [];
}

/** [file, line, character] (1-based, character in code points) of sym's declaration */
function locate(files, sym) {
  for (const f of files) {
    let lines;
    try {
      lines = splitlinesPy(readText(f));
    } catch {
      continue;
    }
    const pats = ANCHORED[LANG[extOf(f)]];
    need(pats, 'KeyError: ext');
    for (const [i, line] of lines.entries()) {
      for (const re of pats) {
        re.lastIndex = 0;
        const m = re.exec(line);
        if (m && m[1] === sym) return [f, i + 1, cpLen(line.slice(0, m.indices[1][0])) + 1];
      }
    }
  }
  return [files[0], 1, 1];
}

const clean = (p) => p.replace(new RegExp(`[^${PY_W}./@+-]`, 'gu'), '?');
const tick = (list) => list.slice(0, 5).map(([, s]) => `\`${s}\``).join(', ');

function decide(raw) {
  const mode = process.env.SCAFFOLDING_REFACTOR_GUARD ?? 'deny';
  if (mode === 'off') return '';
  let d;
  try {
    d = parseJson(raw);
  } catch {
    return '';
  }
  const tool = mget(d, 'tool_name', '');
  const ti = or(mget(d, 'tool_input'), new Map());
  const cwd = or(mget(d, 'cwd'), null) ?? process.cwd();
  const pairs = changedSymbols(tool, ti, cwd).filter(([fs_]) => !fs_.every((f) => TEST_RE.test(f)));
  const missing = pairs.filter(([fs_, s]) => {
    const t = or(mget(d, 'transcript_path'), '');
    need(typeof t === 'string', 'AttributeError: endswith');
    return !evidence(t, fs_, s);
  });
  if (!missing.length) return '';
  const block = mode !== 'warn' ? missing.filter(([fs_]) => lspCovers(extOf(fs_[0]))) : [];
  if (block.length) {
    const [fs_, sym] = block[0];
    const [f, line, ch] = locate(fs_, sym);
    const what = tool === 'Bash' ? 'this Bash sed/perl in-place command' : `this ${tool}`;
    const reason = `refactor-guard BLOCKED: ${what} renames or removes exported ${tick(block)} (defined in ${clean(f)}) and no LSP findReferences `
      + 'on a file defining it, nor graphify query naming it, exists in this session. Do this now: '
      + `(1) call tool \`LSP\` with operation=findReferences, filePath="${clean(f)}", line=${line}, character=${ch} `
      + '(or `mcp__graphify__query_graph` / `mcp__graphify__get_neighbors` with the symbol name); '
      + '(2) then update every reference found using Edit, or retry the same sed after findReferences. '
      + 'If findReferences returns only the declaration, the TypeScript server is still indexing: call it again after a few seconds. '
      + 'Override: SCAFFOLDING_REFACTOR_GUARD=warn (warn only) or =off.';
    return `${pyDumps(new Map([['hookSpecificOutput', new Map([['hookEventName', 'PreToolUse'], ['permissionDecision', 'deny'], ['permissionDecisionReason', reason]])]]))}\n`;
  }
  const f0 = clean(missing[0][0][0]);
  const ext = extOf(missing[0][0][0]);
  const how = lspCovers(ext)
    ? 'run LSP `findReferences` (tool `LSP`, operation=findReferences, filePath, line, character on the declaration) or `mcp__graphify__get_neighbors` / `mcp__graphify__query_graph` with the symbol name'
    : `no LSP server covers \`${ext}\` here, so use \`mcp__graphify__get_neighbors\` / \`mcp__graphify__query_graph\` with the symbol name if available, else \`grep -rnw <symbol>\``;
  const msg = `refactor-guard (warning, not blocking): this change renames or removes exported ${tick(missing)} in ${f0}, and no earlier `
    + 'LSP findReferences on that file or graphify query on the symbol was found in this session. Before '
    + `continuing, ${how}. Update every dependent you find. Set SCAFFOLDING_REFACTOR_GUARD=off to silence.`;
  return `${pyDumps(new Map([['hookSpecificOutput', new Map([['hookEventName', 'PreToolUse'], ['additionalContext', msg]])]]))}\n`;
}

if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) {
  try {
    const out = decide(readStdin());
    if (out) fs.writeSync(1, out);
  } catch {
    /* python swallowed every exception too: no output, exit 0 */
  }
}
