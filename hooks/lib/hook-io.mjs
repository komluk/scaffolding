#!/usr/bin/env node
// hook-io.mjs — JSON in/out helpers for the bash hooks (plain ESM, Node >= 22, no npm deps).
//
// Replaces the `python3 -c "json.load(...)"` one-liners the hooks used to embed. Output is
// byte-compatible with what those one-liners printed, including the Python quirks the hooks
// rely on: `print(x)` of non-strings (None, True, 1.0), `json.dumps` separators and
// `ensure_ascii`, tolerance for NaN/Infinity, strict-UTF-8 stdin, "any error -> empty".
//
// CLI (always exits 0 unless noted; a failure prints what the Python except-branch printed):
//   get [--ti] [--nul] FIELD...   stdin JSON -> one value per field (python print(): value + "\n")
//        FIELD = a.b.c            dotted path; every parent must be an object (else "error")
//        FIELD = a.b=DEFAULT      dict.get(k, DEFAULT): used when the key is missing
//        FIELD = a.b||DEFAULT     `value or DEFAULT`: used when missing or falsy
//        --ti                     root is `tool_input` if present, else the whole object
//        --nul                    NUL-terminated, trailing newlines stripped, NULs dropped (what `$(...)`
//                                 would keep), for `read -r -d ''`. Fields are independent, as if one
//                                 python process per field (a bad field only blanks itself).
//                                 Without --nul fields behave like ONE script printing in sequence:
//                                 on error the values already printed stay, then one empty line per field.
//   get --bool FIELD              prints "true"/"false" (python truthiness; any error -> "false")
//   quote                         stdin text -> JSON string literal (json.dumps; exit 1 on bad UTF-8)
//   emit-block                    stdin text -> {"decision": "block", "reason": <text>} (exit 1 on bad UTF-8)
//   emit-block --guard FIELD      stdin = <hook JSON> NUL <reason>; prints nothing when JSON.FIELD is truthy
//                                 (Stop-hook loop guard), else the block decision: ONE process does both
//   rm-target                     stdin JSON -> "<tool_input.command>\0<first blocked rm target or empty>\0"
//   set-env FILE KEY VARNAME      set settings.env[KEY]=$VARNAME atomically (0600), python json.dump(indent=2)
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- python-compatible JSON parse
// dict -> Map, list -> Array, int -> BigInt, float -> Number. Grammar = Python's json module
// (accepts NaN / Infinity / -Infinity, rejects BOM, control chars in strings, trailing commas).
const NUM = /(-?(?:0|[1-9]\d*))(\.\d+)?([eE][-+]?\d+)?/y;
const PLAIN = /[^"\\\u0000-\u001f]*/y;
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

export function parseJson(text) {
  let i = 0;
  const fail = () => {
    throw new SyntaxError(`invalid JSON at ${i}`);
  };
  const skip = () => {
    while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r') i++;
  };
  const word = (w, v) => {
    if (!text.startsWith(w, i)) fail();
    i += w.length;
    return v;
  };
  const string = () => {
    i++; // opening quote
    let out = '';
    for (;;) {
      PLAIN.lastIndex = i;
      out += PLAIN.exec(text)[0];
      i = PLAIN.lastIndex;
      const c = text[i];
      if (c === '"') {
        i++;
        return out;
      }
      if (c !== '\\') fail(); // end of input or raw control character
      const e = text[i + 1];
      if (e === 'u') {
        const h = text.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) fail();
        out += String.fromCharCode(parseInt(h, 16));
        i += 6;
      } else if (Object.hasOwn(ESCAPES, e)) {
        out += ESCAPES[e];
        i += 2;
      } else fail();
    }
  };
  const scalar = () => {
    const c = text[i];
    if (c === '"') return string();
    if (c === 'n') return word('null', null);
    if (c === 't') return word('true', true);
    if (c === 'f') return word('false', false);
    if (c === 'N') return word('NaN', NaN);
    if (c === 'I') return word('Infinity', Infinity);
    if (text.startsWith('-Infinity', i)) return word('-Infinity', -Infinity);
    NUM.lastIndex = i;
    const m = NUM.exec(text);
    if (!m) fail();
    i = NUM.lastIndex;
    if (!m[2] && !m[3] && m[1].length > 4300) fail(); // python int() digit limit
    return m[2] || m[3] ? Number(m[0]) : BigInt(m[1]);
  };
  const readKey = (f) => {
    if (text[i] !== '"') fail();
    f.k = string();
    skip();
    if (text[i++] !== ':') fail();
    skip();
  };
  // Iterative on purpose: python's json gives up (RecursionError -> the hooks fail open) at ~10k-58k levels of
  // nesting depending on the version, and a recursive JS parser would overflow its stack even earlier. An explicit
  // stack has no depth limit, so a deeply nested payload can no longer hide a tool_input from a blocking hook.
  const stack = [];
  skip();
  let v;
  for (;;) {
    const c = text[i];
    if (c === '{') {
      i++;
      skip();
      if (text[i] === '}') (i++, (v = new Map()));
      else {
        const f = { m: new Map(), k: '' };
        stack.push(f);
        readKey(f);
        continue;
      }
    } else if (c === '[') {
      i++;
      skip();
      if (text[i] === ']') (i++, (v = []));
      else {
        stack.push({ a: [] });
        continue;
      }
    } else v = scalar();
    // v is complete: attach it to its parent(s); a closing bracket completes the parent in turn
    let more = false;
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (f.a) f.a.push(v);
      else f.m.set(f.k, v);
      skip();
      const d = text[i++];
      if (d === (f.a ? ']' : '}')) {
        stack.pop();
        v = f.a ?? f.m;
        continue;
      }
      if (d !== ',') fail();
      skip();
      if (!f.a) readKey(f);
      more = true;
      break;
    }
    if (!more) break;
  }
  skip();
  if (i !== text.length) fail();
  return v;
}

// ---------------------------------------------------------------- python str() / repr() / json.dumps
export function pyFloat(n) {
  if (Number.isNaN(n)) return 'nan';
  if (!Number.isFinite(n)) return n < 0 ? '-inf' : 'inf';
  if (n === 0) return Object.is(n, -0) ? '-0.0' : '0.0';
  const [mant, exp] = n.toExponential().split('e'); // shortest round-trip digits, like repr()
  const neg = mant.startsWith('-');
  const digits = mant.replace(/[-.]/g, '');
  const e = Number(exp);
  let out;
  if (e >= -4 && e < 16) {
    if (e < 0) out = `0.${'0'.repeat(-e - 1)}${digits}`;
    else if (digits.length <= e + 1) out = `${digits}${'0'.repeat(e + 1 - digits.length)}.0`;
    else out = `${digits.slice(0, e + 1)}.${digits.slice(e + 1)}`;
  } else {
    out = `${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ''}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
  }
  return neg ? `-${out}` : out;
}

function pyStrRepr(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === q || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch !== ' ' && /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u.test(ch)) {
      const w = cp < 0x100 ? 2 : cp < 0x10000 ? 4 : 8;
      out += `\\${w === 2 ? 'x' : w === 4 ? 'u' : 'U'}${cp.toString(16).padStart(w, '0')}`;
    } else out += ch;
  }
  return out + q;
}

function pyRepr(v) {
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'number') return pyFloat(v);
  if (typeof v === 'string') return pyStrRepr(v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  return `{${[...v].map(([k, x]) => `${pyStrRepr(k)}: ${pyRepr(x)}`).join(', ')}}`;
}

/** python str(v) */
export const pyStr = (v) => (typeof v === 'string' ? v : pyRepr(v));

/** python bool(v) */
export function pyTruthy(v) {
  if (v === null || v === false || v === 0n || v === '' || v === 0) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  return true; // non-zero numbers (NaN included), non-empty strings
}

const ESC = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
function dumpStr(s, ascii) {
  const re = ascii ? /["\\]|[^ -~]/g : /["\\]|[\u0000-\u001f]/g;
  return `"${s.replace(re, (c) => ESC[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
}

/** python json.dumps(v, indent=indent, ensure_ascii=ascii): Map / Array / BigInt / Number / string / null / bool */
export function pyDumps(v, { indent = null, ascii = true } = {}) {
  const nl = (lvl) => `\n${' '.repeat(indent * lvl)}`;
  const enc = (x, lvl) => {
    if (x === null) return 'null';
    if (x === true) return 'true';
    if (x === false) return 'false';
    if (typeof x === 'bigint') return String(x);
    if (typeof x === 'number') return Number.isNaN(x) ? 'NaN' : Number.isFinite(x) ? pyFloat(x) : x < 0 ? '-Infinity' : 'Infinity';
    if (typeof x === 'string') return dumpStr(x, ascii);
    const arr = Array.isArray(x);
    const items = arr ? x.map((e) => enc(e, lvl + 1)) : (x instanceof Map ? [...x] : Object.entries(x)).map(([k, e]) => `${dumpStr(k, ascii)}: ${enc(e, lvl + 1)}`);
    const [open, close] = arr ? ['[', ']'] : ['{', '}'];
    if (items.length === 0) return open + close;
    if (indent === null) return open + items.join(', ') + close;
    return open + nl(lvl + 1) + items.join(`,${nl(lvl + 1)}`) + nl(lvl) + close;
  };
  return enc(v, 0);
}

// ---------------------------------------------------------------- stdin / lookup helpers
/**
 * utf-8 -> string; invalid bytes become lone surrogates U+DC80..U+DCFF. This is python's `surrogateescape`
 * handler, which python uses for stdin/stdout/argv in the C / POSIX / C.UTF-8 locales (containers, CI,
 * hook runners) - so bad bytes in one field never spoil the parse, and survive a round trip.
 */
export function decodeSurrogateEscape(buf) {
  let out = '';
  let i = 0;
  const cont = (j, lo = 0x80, hi = 0xbf) => j < buf.length && buf[j] >= lo && buf[j] <= hi;
  while (i < buf.length) {
    const b = buf[i];
    let n = 0;
    if (b < 0x80) n = 1;
    else if (b >= 0xc2 && b <= 0xdf && cont(i + 1)) n = 2;
    else if (b >= 0xe0 && b <= 0xef && cont(i + 1, b === 0xe0 ? 0xa0 : 0x80, b === 0xed ? 0x9f : 0xbf) && cont(i + 2)) n = 3;
    else if (b >= 0xf0 && b <= 0xf4 && cont(i + 1, b === 0xf0 ? 0x90 : 0x80, b === 0xf4 ? 0x8f : 0xbf) && cont(i + 2) && cont(i + 3)) n = 4;
    if (n === 0) {
      out += String.fromCharCode(0xdc00 + b);
      i++;
    } else {
      out += buf.toString('utf8', i, i + n);
      i += n;
    }
  }
  return out;
}

/** inverse of decodeSurrogateEscape; any other lone surrogate is unencodable (python: UnicodeEncodeError) */
export function encodeSurrogateEscape(str) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0xd800 || c > 0xdfff) continue;
    if (c <= 0xdbff && i + 1 < str.length && str.charCodeAt(i + 1) >= 0xdc00 && str.charCodeAt(i + 1) <= 0xdfff) {
      i++; // a proper pair
      continue;
    }
    if (c < 0xdc80 || c > 0xdcff) throw new RangeError('unencodable surrogate');
    parts.push(Buffer.from(str.slice(start, i), 'utf8'), Buffer.from([c - 0xdc00]));
    start = i + 1;
  }
  parts.push(Buffer.from(str.slice(start), 'utf8'));
  return Buffer.concat(parts);
}

/** stdin as text, like python `sys.stdin.read()` on a pipe: no \r / \r\n translation; a BOM is kept (python's json rejects it) */
export function readStdin() {
  let buf;
  try {
    buf = fs.readFileSync(0);
  } catch {
    buf = Buffer.alloc(0);
  }
  return decodeSurrogateEscape(buf);
}

/** write text to stdout the way python does in the C locale (surrogateescape) */
const writeOut = (str) => fs.writeSync(1, encodeSurrogateEscape(str));

/** what `$(cmd)` hands to bash: no NULs, no trailing newlines */
export const shellValue = (s) => s.replaceAll('\0', '').replace(/\n+$/, '');

/** python `.get(k, dflt)` chain: parents must be dicts (missing parent -> {}), else AttributeError */
export function lookup(root, keys, dflt = '') {
  let cur = root;
  for (const [n, k] of keys.entries()) {
    if (!(cur instanceof Map)) throw new TypeError('not a dict');
    const last = n === keys.length - 1;
    cur = cur.has(k) ? cur.get(k) : last ? dflt : new Map();
  }
  return cur;
}

/** python: ti = data.get('tool_input', data) */
export function toolInput(root) {
  if (!(root instanceof Map)) throw new TypeError('not a dict');
  return root.has('tool_input') ? root.get('tool_input') : root;
}

const PY_WS = /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/;
/** python str.split() (any unicode whitespace, no empty tokens) */
export const pySplit = (s) => s.split(PY_WS).filter(Boolean);

/** first path argument of an `rm` command that is `/`, `.`, `..`, or /etc /var /usr (or below) */
export function blockedRmTarget(cmd) {
  let inRm = false;
  for (const p of pySplit(cmd)) {
    if (p === 'rm') {
      inRm = true;
      continue;
    }
    if (!inRm || p.startsWith('-')) continue;
    if (p === '/' || p === '.' || p === '..') return p;
    for (const bp of ['/etc', '/var', '/usr']) if (p === bp || p.startsWith(`${bp}/`)) return p;
  }
  return '';
}

// ---------------------------------------------------------------- CLI
function cmdGet(args) {
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const fields = args.filter((a) => !a.startsWith('--'));
  let root;
  let rootErr = false;
  try {
    root = parseJson(readStdin());
  } catch {
    rootErr = true;
  }
  const field = (spec) => {
    if (rootErr) throw new Error('bad input');
    const m = /^([^=|]*)(?:(=|\|\|)([\s\S]*))?$/.exec(spec);
    const keys = m[1].split('.');
    const dflt = m[2] === '=' ? m[3] : '';
    let v;
    if (flags.has('--ti')) v = lookup(toolInput(root), keys, dflt);
    else v = lookup(root, keys, dflt);
    if (m[2] === '||' && !pyTruthy(v)) return m[3];
    const s = pyStr(v);
    encodeSurrogateEscape(s); // python print() raises on surrogates it cannot write
    return s;
  };
  if (flags.has('--bool')) {
    let b = false;
    try {
      b = !rootErr && pyTruthy(lookup(root, fields[0].split('.'), null));
    } catch {
      /* any error -> false */
    }
    process.stdout.write(b ? 'true\n' : 'false\n');
    return;
  }
  const vals = [];
  if (flags.has('--nul')) {
    for (const f of fields) {
      let v = '';
      try {
        v = shellValue(field(f));
      } catch {
        /* this field only */
      }
      vals.push(v);
    }
    writeOut(vals.map((v) => `${v}\0`).join(''));
    return;
  }
  try {
    for (const f of fields) vals.push(field(f));
  } catch {
    // one python script printing in sequence: lines already printed stay, the except branch adds one blank per field
    for (let n = 0; n < fields.length; n++) vals.push('');
  }
  writeOut(vals.map((v) => `${v}\n`).join(''));
}

function cmdEmitBlock(args) {
  const gi = args.indexOf('--guard');
  let reason;
  if (gi >= 0) {
    const buf = fs.readFileSync(0);
    const nul = buf.indexOf(0);
    let active = false;
    try {
      active = pyTruthy(lookup(parseJson(decodeSurrogateEscape(buf.subarray(0, nul < 0 ? buf.length : nul))), [args[gi + 1]], null));
    } catch {
      /* unreadable payload counts as "not active", like the python guard */
    }
    if (active) return;
    reason = decodeSurrogateEscape(buf.subarray(nul < 0 ? buf.length : nul + 1));
  } else reason = readStdin();
  writeOut(`${pyDumps(new Map([['decision', 'block'], ['reason', reason]]))}\n`);
}

function cmdRmTarget() {
  let cmd = '';
  try {
    const s = pyStr(lookup(parseJson(readStdin()), ['tool_input', 'command']));
    encodeSurrogateEscape(s);
    cmd = shellValue(s);
  } catch {
    /* malformed input -> empty command -> allow */
  }
  writeOut(`${cmd}\0${blockedRmTarget(cmd)}\0`);
}

function cmdSetEnv([file, key, varName]) {
  try {
    const d = parseJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file)));
    const val = process.env[varName] ?? '';
    if (!(d instanceof Map)) return;
    if (!d.has('env')) d.set('env', new Map());
    const env = d.get('env');
    if (!(env instanceof Map)) return;
    if (env.get(key) === val) return; // already fresh, no write
    env.set(key, val);
    const tmp = path.join(path.dirname(file), `.tmp${process.pid}${Math.random().toString(36).slice(2, 10)}`);
    try {
      fs.writeFileSync(tmp, `${pyDumps(d, { indent: 2 })}\n`, { mode: 0o600, flag: 'wx' });
      fs.chmodSync(tmp, 0o600);
      fs.renameSync(tmp, file);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
  } catch {
    /* settings missing / malformed / unwritable: leave it untouched */
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === 'get') cmdGet(rest);
    else if (cmd === 'quote') writeOut(`${pyDumps(readStdin())}\n`);
    else if (cmd === 'emit-block') cmdEmitBlock(rest);
    else if (cmd === 'rm-target') cmdRmTarget();
    else if (cmd === 'set-env') cmdSetEnv(rest);
    else process.exitCode = 2;
  } catch {
    process.exitCode = 1; // unencodable output: print nothing, like the python it replaced
  }
}

if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) main(process.argv.slice(2));
