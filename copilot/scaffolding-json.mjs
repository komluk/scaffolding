// scaffolding-json.mjs — read and write settings.json the way python's json.load / json.dump(indent=2) did
// (plain ESM, Node >= 22, node: built-ins only). Used by scaffolding-hook-merge.mjs and scaffolding-skills-merge.mjs.
//
// Why not JSON.parse / JSON.stringify: a user's settings.json must come back byte-for-byte except for the entry we change.
// JSON.parse reorders integer-like keys, turns 1.0 into 1 and rounds integers above 2^53. This parser keeps key order
// (objects are Maps), integers exact (BigInt) and floats as python prints them; the writer escapes non-ASCII like
// json.dump's default ensure_ascii.
//
// The same grammar and formatting as hooks/lib/hook-io.mjs (parseJson / pyDumps). Duplicated on purpose: install.sh copies
// scaffolding-* into ~/.copilot, where there is no hooks/lib to import from. test-copilot.sh checks the two stay equal.
import fs from 'node:fs';

const NUM = /(-?(?:0|[1-9]\d*))(\.\d+)?([eE][-+]?\d+)?/y;
const PLAIN = /[^"\\\u0000-\u001f]*/y;
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

/** python json.loads: dict -> Map (insertion order), list -> Array, int -> BigInt, float -> Number; accepts NaN / Infinity */
export function parse(text) {
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
    i++;
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
      if (c !== '\\') fail();
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
  const value = () => {
    skip();
    const c = text[i];
    if (c === '"') return string();
    if (c === '{') {
      i++;
      const m = new Map();
      skip();
      if (text[i] === '}') return (i++, m);
      for (;;) {
        skip();
        if (text[i] !== '"') fail();
        const k = string();
        skip();
        if (text[i++] !== ':') fail();
        m.set(k, value());
        skip();
        if (text[i] === ',') i++;
        else if (text[i] === '}') return (i++, m);
        else fail();
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      skip();
      if (text[i] === ']') return (i++, a);
      for (;;) {
        a.push(value());
        skip();
        if (text[i] === ',') i++;
        else if (text[i] === ']') return (i++, a);
        else fail();
      }
    }
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
  const v = value();
  skip();
  if (i !== text.length) fail();
  return v;
}

/** python repr(float) */
function pyFloat(n) {
  if (Number.isNaN(n)) return 'nan';
  if (!Number.isFinite(n)) return n < 0 ? '-inf' : 'inf';
  if (n === 0) return Object.is(n, -0) ? '-0.0' : '0.0';
  const [mant, exp] = n.toExponential().split('e');
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

const ESC = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
const dumpStr = (s) => `"${s.replace(/["\\]|[^ -~]/g, (c) => ESC[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;

/** python json.dumps(v, indent=2) (ensure_ascii on) */
export function dumps(v, indent = 2) {
  const nl = (lvl) => `\n${' '.repeat(indent * lvl)}`;
  const enc = (x, lvl) => {
    if (x === null) return 'null';
    if (x === true) return 'true';
    if (x === false) return 'false';
    if (typeof x === 'bigint') return String(x);
    if (typeof x === 'number') return Number.isNaN(x) ? 'NaN' : Number.isFinite(x) ? pyFloat(x) : x < 0 ? '-Infinity' : 'Infinity';
    if (typeof x === 'string') return dumpStr(x);
    const arr = Array.isArray(x);
    const items = arr ? x.map((e) => enc(e, lvl + 1)) : [...x].map(([k, e]) => `${dumpStr(k)}: ${enc(e, lvl + 1)}`);
    const [open, close] = arr ? ['[', ']'] : ['{', '}'];
    if (items.length === 0) return open + close;
    return open + nl(lvl + 1) + items.join(`,${nl(lvl + 1)}`) + nl(lvl) + close;
  };
  return enc(v, 0);
}

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** the settings file as a value; a missing or empty file is {} (a BOM or invalid UTF-8 throws, like python's json.load) */
export function load(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return new Map();
  }
  if (!st.isFile() || st.size === 0) return new Map();
  return parse(UTF8.decode(fs.readFileSync(file)).replace(/\r\n?/g, '\n'));
}

/** write `<file>.tmp` then rename over `file` */
export function save(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${dumps(data)}\n`);
  fs.renameSync(tmp, file);
}
