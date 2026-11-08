// py.mjs — the python behaviour action_log.py relied on (plain ESM, Node >= 22, node: built-ins only).
// Faithful ports, quirks included, because the log must be byte-identical to what the python wrote:
// code point slicing, str.strip, `\b` / `\w` / `\s` / `\d` of str patterns, case-insensitive matching of
// ASCII letters, json.loads(bytes) (encoding detection, surrogatepass), strict utf-8 encoding, int(), ordering.
import fs from 'node:fs';
import { parseJson, pyFloat } from '../hook-io.mjs';
import { PY_S, cmpCp } from '../pystd.mjs';

export { PY_S };

// ---------------------------------------------------------------- regex building blocks (str patterns are Unicode-aware)
// `\p{L}\p{N}_` is python's `\w`. Node's tables are newer than CPython 3.14's (Unicode 17 vs 16): code points assigned
// only in Unicode 17 count as word characters here (CPython 3.15 does the same).
export const PY_W = String.raw`\p{L}\p{N}_`;
export const W = `[${PY_W}]`;
export const NW = `[^${PY_W}]`;
export const S = `[${PY_S}]`;
export const NS = `[^${PY_S}]`;
/** python `\b` */
export const WB = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
/** python `\d` */
export const D = String.raw`\p{Nd}`;

// re.IGNORECASE folds ASCII letters with a few non-ASCII ones (sre's simple-case equivalences): İ ı for i, ſ for s, K for k.
const FOLD_EXTRA = { i: 'İı', s: 'ſ', k: 'K' };
/** a literal word as a case-insensitive regex fragment (python `(?i)` semantics) */
export const ci = (word) =>
  [...word].map((c) => (/[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}${FOLD_EXTRA[c.toLowerCase()] ?? ''}]` : c)).join('');

// ---------------------------------------------------------------- str helpers
const SPACE = new Set([0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000]);
/** str.isspace() for one UTF-16 unit (all whitespace is in the BMP) */
export const isPySpace = (c) => (c >= 9 && c <= 13) || (c >= 0x2000 && c <= 0x200a) || SPACE.has(c);

export function pyStrip(s, left = true, right = true) {
  let a = 0;
  let b = s.length;
  if (left) while (a < b && isPySpace(s.charCodeAt(a))) a++;
  if (right) while (b > a && isPySpace(s.charCodeAt(b - 1))) b--;
  return s.slice(a, b);
}
export const pyRstrip = (s) => pyStrip(s, false, true);

/** s[:n] by code points (python str); a lone surrogate counts as one */
export function cpHead(s, n) {
  if (s.length <= n) return s;
  let i = 0;
  for (let k = 0; k < n && i < s.length; k++) {
    const c = s.charCodeAt(i);
    i += c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1;
  }
  return s.slice(0, i);
}
/** s[a:b] by code points */
export const cpSlice = (s, a, b) => Array.from(s).slice(a, b).join('');
/** s[:-n] by code points */
export const cpDropLast = (s, n) => Array.from(s).slice(0, -n).join('');

/** str.encode("utf-8"): lone surrogates raise like UnicodeEncodeError */
export function encodeStrict(s) {
  if (!s.isWellFormed()) throw new RangeError("'utf-8' codec can't encode: surrogates not allowed");
  return Buffer.from(s, 'utf8');
}

// ---------------------------------------------------------------- python int() / ordering / hashing of JSON values
/** int(x) for a JSON value (bool, int, float, str); anything else raises like python */
export function pyInt(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('cannot convert to integer');
    return Math.trunc(v);
  }
  if (typeof v === 'string') {
    const t = pyStrip(v);
    if (!/^[+-]?[0-9]+(?:_[0-9]+)*$/.test(t)) throw new TypeError(`invalid literal for int(): ${v}`);
    return Number(t.replaceAll('_', ''));
  }
  throw new TypeError('int() argument must be a string or a real number');
}

/** hashable key of a JSON value for Counter / set (1, 1.0 and True collide like in python); unhashable raises */
export function pyKey(v) {
  if (v === null) return 'N';
  if (typeof v === 'string') return `s${v}`;
  if (typeof v === 'boolean') return `n${v ? 1 : 0}`;
  if (typeof v === 'bigint') return `n${v}`;
  if (typeof v === 'number') return Number.isInteger(v) ? `n${BigInt(v)}` : `f${v}`;
  throw new TypeError('unhashable type');
}
export const pyEq = (a, b) => pyKey(a) === pyKey(b);

const isNum = (v) => typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean';
/** python `a < b` for the JSON scalars; mixed or unorderable types raise like python */
export function pyLt(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return cmpCp(a, b) < 0;
  if (isNum(a) && isNum(b)) {
    const x = typeof a === 'boolean' ? Number(a) : a;
    const y = typeof b === 'boolean' ? Number(b) : b;
    return x < y; // JS compares bigint / number exactly
  }
  throw new TypeError("'<' not supported between these types");
}
export const pyCmp = (a, b) => (pyLt(a, b) ? -1 : pyLt(b, a) ? 1 : 0);

// ---------------------------------------------------------------- json.loads(bytes)
const STRICT = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const starts = (b, ...bytes) => bytes.every((x, i) => b[i] === x);

function utf8SurrogatePass(b) {
  try {
    return STRICT.decode(b);
  } catch {
    /* maybe CESU-encoded surrogates (accepted by python's surrogatepass) or genuinely invalid */
  }
  let out = '';
  const cont = (j, lo = 0x80, hi = 0xbf) => j < b.length && b[j] >= lo && b[j] <= hi;
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    let n = 0;
    if (x < 0x80) n = 1;
    else if (x >= 0xc2 && x <= 0xdf && cont(i + 1)) n = 2;
    else if (x >= 0xe0 && x <= 0xef && cont(i + 1, x === 0xe0 ? 0xa0 : 0x80) && cont(i + 2)) n = 3; // ED A0..BF = a surrogate
    else if (x >= 0xf0 && x <= 0xf4 && cont(i + 1, x === 0xf0 ? 0x90 : 0x80, x === 0xf4 ? 0x8f : 0xbf) && cont(i + 2) && cont(i + 3)) n = 4;
    if (!n) throw new RangeError("'utf-8' codec can't decode byte");
    if (n === 3 && x === 0xed && b[i + 1] >= 0xa0) out += String.fromCharCode(((x & 0xf) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f));
    else out += b.toString('utf8', i, i + n);
    i += n;
  }
  return out;
}
function utf16(b, le) {
  if (b.length % 2) throw new RangeError('truncated data');
  let out = '';
  for (let i = 0; i < b.length; i += 2) out += String.fromCharCode(le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
  return out;
}
function utf32(b, le) {
  if (b.length % 4) throw new RangeError('truncated data');
  let out = '';
  for (let i = 0; i < b.length; i += 4) {
    const v = le ? b.readUInt32LE(i) : b.readUInt32BE(i);
    if (v > 0x10ffff) throw new RangeError('code point not in range(0x110000)');
    out += v >= 0xd800 && v <= 0xdfff ? String.fromCharCode(v) : String.fromCodePoint(v);
  }
  return out;
}

/** json.detect_encoding + bytes.decode(enc, "surrogatepass") */
function decodeJsonBytes(b) {
  if (starts(b, 0xff, 0xfe, 0, 0)) return utf32(b.subarray(4), true);
  if (starts(b, 0, 0, 0xfe, 0xff)) return utf32(b.subarray(4), false);
  if (starts(b, 0xff, 0xfe)) return utf16(b.subarray(2), true);
  if (starts(b, 0xfe, 0xff)) return utf16(b.subarray(2), false);
  if (starts(b, 0xef, 0xbb, 0xbf)) return utf8SurrogatePass(b.subarray(3));
  if (b.length >= 4) {
    if (!b[0]) return b[1] ? utf16(b, false) : utf32(b, false);
    if (!b[1]) return b[2] || b[3] ? utf16(b, true) : utf32(b, true);
  } else if (b.length === 2) {
    if (!b[0]) return utf16(b, false);
    if (!b[1]) return utf16(b, true);
  }
  return utf8SurrogatePass(b);
}
/** json.loads(<bytes>) — throws (like ValueError) on undecodable or invalid JSON */
export const loadsBytes = (b) => parseJson(decodeJsonBytes(b));

/** text-mode `open(path, encoding="utf-8")` content: strict decode (BOM kept), \r\n and \r become \n */
export const readTextStrict = (buf) => STRICT.decode(buf).replace(/\r\n?/g, '\n');

/** lines of a file as raw bytes including the "\n", like `for raw in open(path, "rb")`; an OSError just ends the iteration */
export function* eachLine(path, chunk = 1 << 20) {
  let fd;
  try {
    fd = fs.openSync(path, 'r');
  } catch {
    return;
  }
  try {
    const buf = Buffer.allocUnsafe(chunk);
    let carry = [];
    for (;;) {
      let n;
      try {
        n = fs.readSync(fd, buf, 0, chunk, null);
      } catch {
        return;
      }
      if (n === 0) break;
      const data = buf.subarray(0, n);
      let start = 0;
      for (let nl = data.indexOf(0x0a); nl >= 0; nl = data.indexOf(0x0a, start)) {
        const piece = Buffer.from(data.subarray(start, nl + 1));
        yield carry.length ? Buffer.concat([...carry, piece]) : piece;
        carry = [];
        start = nl + 1;
      }
      if (start < n) carry.push(Buffer.from(data.subarray(start)));
    }
    if (carry.length) yield Buffer.concat(carry);
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------- json.dumps(..., ensure_ascii=False, separators=(",", ":"))
const ESC = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
const dstr = (s) => `"${s.replace(/["\\\u0000-\u001f]/g, (c) => ESC[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
/** compact dumps of Map / Array / bigint (int) / number (float) / string / boolean / null */
export function dumps(v) {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : Number.isFinite(v) ? pyFloat(v) : v < 0 ? '-Infinity' : 'Infinity';
  if (typeof v === 'string') return dstr(v);
  if (Array.isArray(v)) return `[${v.map(dumps).join(',')}]`;
  return `{${(v instanceof Map ? [...v] : Object.entries(v)).map(([k, x]) => `${dstr(k)}:${dumps(x)}`).join(',')}}`;
}
