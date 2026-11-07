// shell-glob.mjs — brace expansion and glob matching for the blocking hooks (shell-words.mjs, guards.mjs).
// Matching is case-insensitive on purpose (macOS / Windows file systems are). Plain ESM, no dependencies.

export const hasGlob = (w) => /[*?[]/.test(w);

/** bash brace expansion of one word: {a,b} (nested) and {x..y} char/int ranges; null when over `limit` words */
export function braceExpand(word, limit = 256) {
  const out = [];
  const go = (s) => {
    if (out.length > limit) return;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '{' || s[i - 1] === '$') continue;
      let d = 0;
      let j = i;
      const commas = [];
      for (; j < s.length; j++) {
        if (s[j] === '{') d++;
        else if (s[j] === '}' && --d === 0) break;
        else if (s[j] === ',' && d === 1) commas.push(j);
      }
      if (j >= s.length) break; // unbalanced: the rest is literal
      const pre = s.slice(0, i);
      const post = s.slice(j + 1);
      const body = s.slice(i + 1, j);
      let parts = null;
      if (commas.length) {
        parts = [];
        let a = i + 1;
        for (const c of commas) {
          parts.push(s.slice(a, c));
          a = c + 1;
        }
        parts.push(s.slice(a, j));
      } else parts = range(body, limit);
      if (!parts) continue; // `{x}` is literal
      for (const p of parts) go(pre + p + post);
      return;
    }
    out.push(s);
  };
  go(word);
  return out.length > limit ? null : out;
}

function range(body, limit) {
  const m = /^(-?\d+|[a-zA-Z])\.\.(-?\d+|[a-zA-Z])$/.exec(body);
  if (!m) return null;
  const num = /\d/.test(m[1]) && /\d/.test(m[2]);
  if (!num && (/\d/.test(m[1]) || /\d/.test(m[2]))) return null;
  const a = num ? Number(m[1]) : m[1].charCodeAt(0);
  const b = num ? Number(m[2]) : m[2].charCodeAt(0);
  const out = [];
  for (let k = a; a <= b ? k <= b : k >= b; k += a <= b ? 1 : -1) {
    out.push(num ? String(k) : String.fromCharCode(k));
    if (out.length > limit) break;
  }
  return out;
}

/** glob pattern -> tokens: { t: 'c', c } literal, { t: '?' }, { t: '*' }, { t: '[', neg, ranges } */
function globTokens(p) {
  const toks = [];
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') toks.push({ t: '*' });
    else if (c === '?') toks.push({ t: '?' });
    else if (c === '[') {
      let j = i + 1;
      let neg = false;
      if (p[j] === '!' || p[j] === '^') (neg = true), j++;
      const start = j;
      if (p[j] === ']') j++;
      while (j < p.length && p[j] !== ']') j++;
      if (j >= p.length) {
        toks.push({ t: 'c', c });
        continue;
      }
      const body = p.slice(start, j);
      const ranges = [];
      for (let k = 0; k < body.length; k++) {
        if (body[k + 1] === '-' && k + 2 < body.length) {
          ranges.push([body[k].toLowerCase(), body[k + 2].toLowerCase()]);
          k += 2;
        } else ranges.push([body[k].toLowerCase(), body[k].toLowerCase()]);
      }
      toks.push({ t: '[', neg, ranges });
      i = j;
    } else toks.push({ t: 'c', c });
  }
  return toks;
}

function tokMatch(tok, ch) {
  const x = ch.toLowerCase();
  if (tok.t === '?') return true;
  if (tok.t === 'c') return tok.c.toLowerCase() === x;
  return tok.ranges.some(([a, b]) => x >= a && x <= b) !== tok.neg;
}

/** NFA run: the set of pattern positions alive after consuming `s` (position toks.length = whole pattern used) */
function globRun(toks, s) {
  const close = (set) => {
    for (const i of [...set]) for (let k = i; k < toks.length && toks[k].t === '*'; ) set.add(++k);
    return set;
  };
  let cur = close(new Set([0]));
  for (const ch of s) {
    const next = new Set();
    for (const i of cur) {
      if (i >= toks.length) continue;
      if (toks[i].t === '*') next.add(i);
      else if (tokMatch(toks[i], ch)) next.add(i + 1);
    }
    cur = close(next);
    if (!cur.size) break;
  }
  return cur;
}

/** does glob `pattern` match all of `s`? A leading dot in `s` needs a literal dot (bash without dotglob). */
export function globMatches(pattern, s) {
  const toks = globTokens(pattern);
  if (s.startsWith('.') && !(toks[0]?.t === 'c' && toks[0].c === '.')) return false;
  return globRun(toks, s).has(toks.length);
}

/**
 * could the glob `pattern` (a basename) name `exact`, or a file starting with `prefix`? A leading dot is never
 * matched by a wildcard (bash without dotglob), so the pattern must start with a literal '.' to name a dotfile.
 */
export function globCouldName(pattern, exact, prefix) {
  const toks = globTokens(pattern);
  if (exact.startsWith('.') && !(toks[0]?.t === 'c' && toks[0].c === '.')) return false;
  if (globRun(toks, exact).has(toks.length)) return true;
  return globRun(toks, prefix).size > 0; // what is left of the pattern can always match something
}
