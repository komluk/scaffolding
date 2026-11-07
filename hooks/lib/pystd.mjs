// pystd.mjs — the python stdlib behaviour the ported hooks relied on (plain ESM, Node >= 22, node: built-ins only).
// Faithful ports, quirks included, because the hooks must give byte-identical decisions: os.path.{join,split,
// splitext,normpath,abspath,realpath}, shutil.which, shlex.split (posix), glob.glob + fnmatch, str.splitlines,
// text-mode `open(f, errors="ignore").read()`, raw `os.listdir` order, and python's str ordering (code points).
// Not here on purpose: fs.globSync (sorted, recursive `**`, `[^x]` negates) differs from glob.glob in ways that
// change which file a deny message names.
import fs from 'node:fs';
import { decodeSurrogateEscape, pySplit } from './hook-io.mjs';

export { pySplit };
/** python's \w and \s as regex character-class bodies (str patterns are Unicode-aware; JS \s differs: \x1c-\x1f, \x85, ﻿) */
export const PY_W = String.raw`\p{L}\p{N}_`;
export const PY_S = String.raw`\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000`;

const fail = (what) => {
  throw new TypeError(what);
};

/** python `a < b` for str: by code point (JS default sort is by UTF-16 unit) */
export function cmpCp(a, b) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i);
    const y = b.codePointAt(j);
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return i < a.length ? 1 : j < b.length ? -1 : 0;
}

/** python re.escape (3.7+): only the regex-special ASCII characters */
export const pyReEscape = (s) => s.replace(/[()[\]{}?*+\-|^$\\.&~# \t\n\r\v\f]/g, '\\$&');

// ---------------------------------------------------------------- os.path
export function pyJoin(a, ...parts) {
  if (typeof a !== 'string') fail('join: str expected');
  let p = a;
  for (const b of parts) {
    if (typeof b !== 'string') fail('join: str expected');
    if (b.startsWith('/') || !p) p = b;
    else if (p.endsWith('/')) p += b;
    else p += `/${b}`;
  }
  return p;
}

export function pySplitPath(p) {
  const i = p.lastIndexOf('/') + 1;
  let head = p.slice(0, i);
  const tail = p.slice(i);
  if (head && head !== '/'.repeat(head.length)) head = head.replace(/\/+$/, '');
  return [head, tail];
}

export function pySplitext(p) {
  if (typeof p !== 'string') fail('splitext: str expected');
  const sep = p.lastIndexOf('/');
  const dot = p.lastIndexOf('.');
  if (dot > sep) {
    for (let i = sep + 1; i < dot; i++) if (p[i] !== '.') return [p.slice(0, dot), p.slice(dot)];
  }
  return [p, ''];
}

export function pyNormpath(path) {
  if (!path) return '.';
  const initial = path.startsWith('//') && !path.startsWith('///') ? '//' : path.startsWith('/') ? '/' : '';
  const out = [];
  for (const c of path.split('/')) {
    if (!c || c === '.') continue;
    if (c !== '..' || (!initial && !out.length) || (out.length && out[out.length - 1] === '..')) out.push(c);
    else if (out.length) out.pop();
  }
  return initial + out.join('/') || '.';
}

export const pyAbspath = (p) => pyNormpath(p.startsWith('/') ? p : pyJoin(process.cwd(), p));

/** os.path.realpath, non-strict (3.14 algorithm). A path python cannot lstat (NUL byte: ValueError) raises. */
export function pyRealpath(filename) {
  const rest = filename.split('/').reverse();
  let count = rest.length;
  let cur = filename.startsWith('/') ? '/' : process.cwd();
  const seen = new Map();
  while (count) {
    const name = rest.pop();
    if (name === null) {
      seen.set(rest.pop(), cur);
      continue;
    }
    count--;
    if (!name || name === '.') continue;
    if (name === '..') {
      cur = cur.slice(0, cur.lastIndexOf('/')) || '/';
      continue;
    }
    const next = cur === '/' ? cur + name : `${cur}/${name}`;
    let target;
    try {
      const st = fs.lstatSync(next, { throwIfNoEntry: false }); // ENOENT is the common case: no exception object
      if (!st || !st.isSymbolicLink()) {
        cur = next;
        continue;
      }
      if (seen.has(next)) {
        cur = seen.get(next) ?? next;
        continue;
      }
      target = fs.readlinkSync(next);
    } catch (e) {
      if (typeof e.errno !== 'number') throw e; // an OSError is swallowed, anything else is not
      cur = next;
      continue;
    }
    if (target.startsWith('/')) cur = '/';
    seen.set(next, null);
    rest.push(next, null);
    const parts = target.split('/').reverse();
    rest.push(...parts);
    count += parts.length;
  }
  return cur;
}

const statOf = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
};
export const isFile = (p) => statOf(p)?.isFile() ?? false;
export const isDir = (p) => statOf(p)?.isDirectory() ?? false;
const lexists = (p) => {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

/** shutil.which(cmd) with the default mode (exists, executable by the real uid, not a directory) */
export function pyWhich(cmd) {
  if (typeof cmd !== 'string') fail('which: str expected');
  const [dirname, name] = pySplitPath(cmd);
  let dirs;
  if (dirname) dirs = [dirname];
  else {
    const path = process.env.PATH ?? '/bin:/usr/bin';
    if (!path) return null;
    dirs = path.split(':');
  }
  const seen = new Set();
  for (const d of dirs) {
    if (seen.has(d)) continue;
    seen.add(d);
    const f = pyJoin(d, name);
    const st = statOf(f);
    if (!st || st.isDirectory()) continue;
    try {
      fs.accessSync(f, fs.constants.X_OK);
      return f;
    } catch {
      /* not executable */
    }
  }
  return null;
}

/** python mtime as a float (`sec + nsec * 1e-9`), so equal-to-the-microsecond files tie exactly like in python */
export function pyMtime(file) {
  const ns = fs.statSync(file, { bigint: true }).mtimeNs;
  return Number(ns / 1000000000n) + Number(ns % 1000000000n) * 1e-9;
}

// ---------------------------------------------------------------- text
/** str.splitlines() */
export function splitlinesPy(s) {
  const lines = s.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** bytes -> str like `.decode("utf-8", "ignore")`: undecodable bytes are dropped */
const STRICT = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export function decodeIgnore(buf) {
  try {
    return STRICT.decode(buf); // valid utf-8 (the normal case) takes the native path: ~100x faster on a 2 MB transcript
  } catch {
    return decodeSurrogateEscape(buf).replace(/[\udc80-\udcff]/gu, '');
  }
}

/** `open(f, errors="ignore").read()`: text mode, so \r\n and a lone \r both become \n. Throws like open() does. */
export const readText = (file) => decodeIgnore(fs.readFileSync(file)).replace(/\r\n?/g, '\n');

// ---------------------------------------------------------------- shlex.split(s) (posix, whitespace_split, no comments)
export class ShlexError extends Error {}

export function shlexSplit(s) {
  const chars = Array.from(s);
  const out = [];
  let pos = 0;
  const isWs = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\n';
  for (let eof = false; !eof; ) {
    let state = ' ';
    let token = '';
    let quoted = false;
    let escaped = ' ';
    for (;;) {
      const c = pos < chars.length ? chars[pos++] : '';
      if (state === '"' || state === "'") {
        quoted = true;
        if (c === '') throw new ShlexError('No closing quotation');
        if (c === state) state = 'a';
        else if (c === '\\' && state === '"') {
          escaped = state;
          state = '\\';
        } else token += c;
      } else if (state === '\\') {
        if (c === '') throw new ShlexError('No escaped character');
        if ((escaped === '"' || escaped === "'") && c !== state && c !== escaped) token += state;
        token += c;
        state = escaped;
      } else if (c === '') {
        eof = true;
        break;
      } else if (isWs(c)) {
        state = ' ';
        if (token || quoted) break;
      } else if (c === '\\') {
        escaped = 'a';
        state = '\\';
      } else if (c === '"' || c === "'") state = c;
      else if (state === ' ') {
        token = c;
        state = 'a';
      } else token += c;
    }
    if (token || quoted) out.push(token);
  }
  return out;
}

// ---------------------------------------------------------------- glob.glob / fnmatch (non-recursive, no hidden files)
/** names in an `os.scandir` / `os.listdir` order (raw readdir; fs.readdirSync sorts); [] when unreadable */
export function listdirRaw(dir) {
  const names = [];
  let d;
  try {
    d = fs.opendirSync(dir === '' ? '.' : dir);
  } catch {
    return names;
  }
  try {
    for (let e = d.readSync(); e; e = d.readSync()) names.push(e.name);
  } catch {
    /* keep what was read */
  } finally {
    try {
      d.closeSync();
    } catch {
      /* ignore */
    }
  }
  return names;
}

/** fnmatch.translate()'s character-set handling, as [lo, hi] code point ranges */
function parseSet(p, i, j) {
  let chunks;
  if (!p.slice(i, j).includes('-')) chunks = [p.slice(i, j)];
  else {
    chunks = [];
    let k = p[i] === '!' ? i + 2 : i + 1;
    for (;;) {
      k = p.indexOf('-', k);
      if (k < 0 || k >= j) break;
      chunks.push(p.slice(i, k));
      i = k + 1;
      k += 3;
    }
    const chunk = p.slice(i, j);
    if (chunk.length) chunks.push(chunk);
    else chunks[chunks.length - 1] = [...chunks[chunks.length - 1], '-'];
    for (let n = chunks.length - 1; n > 0; n--) {
      if (chunks[n - 1].at(-1).codePointAt(0) > chunks[n][0].codePointAt(0)) {
        chunks[n - 1] = [...chunks[n - 1].slice(0, -1), ...chunks[n].slice(1)];
        chunks.splice(n, 1);
      }
    }
  }
  const neg = chunks[0][0] === '!';
  if (neg) chunks[0] = chunks[0].slice(1);
  const ranges = [];
  chunks.forEach((ch, idx) => {
    const last = idx === chunks.length - 1;
    for (let q = idx > 0 ? 1 : 0; q < (last ? ch.length : ch.length - 1); q++) ranges.push([ch[q].codePointAt(0), ch[q].codePointAt(0)]);
    if (!last) ranges.push([ch.at(-1).codePointAt(0), chunks[idx + 1][0].codePointAt(0)]);
  });
  return { k: 's', neg, ranges };
}

function compileFnmatch(pat) {
  const p = Array.from(pat);
  const items = [];
  let i = 0;
  while (i < p.length) {
    const c = p[i++];
    if (c === '*') {
      items.push({ k: '*' });
      while (i < p.length && p[i] === '*') i++;
    } else if (c === '?') items.push({ k: '?' });
    else if (c === '[') {
      let j = i;
      if (j < p.length && p[j] === '!') j++;
      if (j < p.length && p[j] === ']') j++;
      while (j < p.length && p[j] !== ']') j++;
      if (j >= p.length) items.push({ k: 'c', c: '[' });
      else {
        items.push(parseSet(p, i, j));
        i = j + 1;
      }
    } else items.push({ k: 'c', c });
  }
  return items;
}

function matchOne(it, ch) {
  if (it.k === '?') return true;
  if (it.k === 'c') return it.c === ch;
  const cp = ch.codePointAt(0);
  return it.ranges.some(([lo, hi]) => cp >= lo && cp <= hi) !== it.neg;
}

function fnmatchFilter(names, pat) {
  const items = compileFnmatch(pat);
  return names.filter((name) => {
    const s = Array.from(name);
    let pi = 0;
    let si = 0;
    let starPi = -1;
    let starSi = 0;
    while (si < s.length) {
      if (pi < items.length && items[pi].k === '*') {
        starPi = pi++;
        starSi = si;
      } else if (pi < items.length && matchOne(items[pi], s[si])) {
        pi++;
        si++;
      } else if (starPi >= 0) {
        pi = starPi + 1;
        si = ++starSi;
      } else return false;
    }
    while (pi < items.length && items[pi].k === '*') pi++;
    return pi === items.length;
  });
}

const hasMagic = (s) => /[*?[]/.test(s);
const joinNonEmpty = (a, b) => (!a || !b ? a || b : pyJoin(a, b));

function glob1(dirname, pattern, dironly) {
  let names = listdirRaw(dirname);
  if (dironly) names = names.filter((n) => isDir(joinNonEmpty(dirname, n)));
  if (pattern[0] !== '.') names = names.filter((n) => n[0] !== '.');
  return fnmatchFilter(names, pattern);
}

function glob0(dirname, basename) {
  if (basename) return lexists(joinNonEmpty(dirname, basename)) ? [basename] : [];
  return isDir(dirname) ? [basename] : [];
}

function iglob(pathname, dironly) {
  const [dirname, basename] = pySplitPath(pathname);
  if (!hasMagic(pathname)) {
    if (basename) return lexists(pathname) ? [pathname] : [];
    return isDir(dirname) ? [pathname] : [];
  }
  if (!dirname) return glob1('', basename, dironly);
  const dirs = dirname !== pathname && hasMagic(dirname) ? iglob(dirname, true) : [dirname];
  const inDir = hasMagic(basename) ? glob1 : glob0;
  return dirs.flatMap((d) => inDir(d, basename, dironly).map((name) => pyJoin(d, name)));
}

/** glob.glob(pathname) */
export const pyGlob = (pathname) => iglob(pathname, false);
