// redact.mjs — defense-in-depth redaction for the episodic action log (port of action_log_lib/redact.py).
//
// The real protection is structural: raw tool output / file contents are never read into a record. This pass
// only covers what is left (command lines, short args). Fail-closed per field: any error replaces the field
// with REDACTION_ERROR.
//
// Python's `re` and JS differ in ways that matter for a redactor, so every pattern is built with the python
// semantics spelled out: `\b` / `\w` / `\d` / `\s` of a str pattern are Unicode-aware (py.mjs), `(?i)` also folds
// İ ı ſ K, and the vendored presidio patterns (written for python) are converted by `pyRegex` below
// (Unicode classes, atomic groups `(?>...)`). All of them must compile: tests/hooks/test-action-log.sh asserts it,
// because a pattern that silently fails to compile would silently stop redacting.
import fs from 'node:fs';
import path from 'node:path';
import { parseJson } from '../hook-io.mjs';
import { PY_W, PY_S, WB, ci, D } from './py.mjs';

export const REDACTION_ERROR = '<redaction-error>';

const PATTERNS_FILE = path.join(import.meta.dirname, '..', 'secret-patterns.json');

const NAMES = ci('token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|client[_-]?secret|authorization');
const NS = `[^${PY_S}]`; // python \S
const SP = `[${PY_S}]`; // python \s
// [A-Z0-9_] under re.IGNORECASE
const UPPER_CLASS = 'A-Za-z0-9_İıſK';
const rx = (src) => new RegExp(src, 'gu');

// Order matters: header / bearer / assignment rules run before the generic blob rule.
const GENERIC = [
  [rx(`${WB}eyJ[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]*`), '***'],
  [rx(`${WB}(${ci('authorization|x-api-key|private-token')})${WB}${SP}*:${SP}*[^'"\\n]+`), '$1: ***'],
  [rx(`${WB}${ci('bearer')}${SP}+${NS}+`), 'Bearer ***'],
  [rx(`${WB}(${NAMES})${WB}${SP}*[=:]${SP}*${NS}+`), '$1=***'],
  [rx(`(${WB}[${UPPER_CLASS}]*(?:${NAMES})[${UPPER_CLASS}]*)=${NS}+`), '$1=***'],
  [rx('://[^/@' + PY_S + ']+@'), '://***@'],
  [rx(`(?<![${PY_W}-])--?(?:password|passwd|pass|pw)(?:[= ]${NS}+)`), '--password ***'],
  [rx(`(?<![${PY_W}-])-p(?=${NS}*[A-Za-z0-9])${NS}{3,}`), '-p***'],
  [rx(`(--[${PY_W}-]*(?:${ci('token|secret|passw(?:or)?d|api-?key|auth|credential')})[${PY_W}-]*)(?:=|${SP}+)${NS}+`), '$1 ***'],
  [rx(`(?<![${PY_W}-])(-u|--user)(?:=|${SP}+)${NS}+:${NS}+`), '$1 ***'],
  [rx(`([?&](?:[${PY_W}-]*(?:${ci('token|secret|key|sig|auth|pass|password')})[${PY_W}-]*)=)[^&${PY_S}"']+`), '$1***'],
];
const LONG_RUN = /[A-Za-z0-9+/_=-]{32,}/gu;
const SAFE_ID = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/u;

// ---------------------------------------------------------------- python regex source -> JS (flags gu)
const OUTSIDE = { w: `[${PY_W}]`, W: `[^${PY_W}]`, d: D, D: String.raw`\P{Nd}`, s: `[${PY_S}]`, S: `[^${PY_S}]`, b: WB, B: `(?!${WB})` };
const INSIDE = { w: PY_W, d: D, D: String.raw`\P{Nd}` }; // \s / \S stay as JS in a class: the patterns only use `[\s\S]` (= anything)

/**
 * Convert a python `re` pattern (as vendored in secret-patterns.json) to a global, unicode JS RegExp.
 * Handles what those patterns use: \w \W \d \D \s \S \b \B with python's Unicode meaning, escaped punctuation that the
 * JS `u` flag forbids (`\-` outside a class), and atomic groups `(?>X)` -> `(?=(?<aN>X))\k<aN>`. Anything else is passed
 * through, so an unsupported construct fails to compile (or is caught by the tests) instead of silently changing meaning.
 */
export function pyRegex(src) {
  let out = '';
  let inClass = false;
  let atomic = 0;
  const open = []; // per open group: its atomic id, or 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      const n = src[++i];
      if (n === undefined) throw new SyntaxError('trailing backslash');
      if (inClass) out += INSIDE[n] ?? `\\${n}`;
      else if (OUTSIDE[n]) out += OUTSIDE[n];
      else out += /[A-Za-z0-9]/.test(n) || '^$\\.*+?()[]{}|/'.includes(n) ? `\\${n}` : n;
    } else if (inClass) {
      if (c === ']') inClass = false;
      out += c;
    } else if (c === '[') {
      inClass = true;
      out += c;
      if (src[i + 1] === '^') out += src[++i];
      if (src[i + 1] === ']') out += String.raw`\]`, i++; // a leading ] is a literal in python
    } else if (c === '(') {
      if (src.startsWith('(?>', i)) {
        open.push(++atomic);
        out += `(?=(?<a${atomic}>`;
        i += 2;
      } else {
        open.push(0);
        out += c;
      }
    } else if (c === ')') {
      const a = open.pop();
      if (a === undefined) throw new SyntaxError('unbalanced )');
      out += a ? `))\\k<a${a}>` : ')';
    } else out += c;
  }
  if (inClass || open.length) throw new SyntaxError('unterminated');
  return new RegExp(out, 'gu');
}

let vendored = null;
function loadVendored() {
  if (vendored) return vendored;
  const compiled = [];
  try {
    const doc = parseJson(fs.readFileSync(PATTERNS_FILE, 'utf8'));
    for (const p of doc.get('patterns')) {
      try {
        // PL_PESEL was compiled with re.IGNORECASE; it has no letters, so the flag changes nothing
        compiled.push(pyRegex(p.get('regex')));
      } catch {
        /* a pattern that does not compile is skipped (python: re.error); tests assert that none is */
      }
    }
  } catch {
    compiled.length = 0; // unreadable / malformed / no "patterns": no vendored patterns at all (python: OSError, ValueError, KeyError)
  }
  vendored = compiled;
  return vendored;
}

/** the vendored patterns that failed to convert/compile (must be empty; asserted by the tests) */
export function brokenVendoredPatterns() {
  const doc = parseJson(fs.readFileSync(PATTERNS_FILE, 'utf8'));
  const bad = [];
  for (const p of doc.get('patterns')) {
    try {
      pyRegex(p.get('regex'));
    } catch (e) {
      bad.push(`${p.get('entity')}: ${e.message}`);
    }
  }
  return bad;
}

/** a long token mixing letters and digits that is not a git SHA / UUID */
function secretish(seg) {
  if (seg.length < 32 || SAFE_ID.test(seg)) return false;
  return (/[0-9]/.test(seg) && /[A-Za-z]/.test(seg)) || seg.length >= 48;
}

function longRun(s) {
  if (SAFE_ID.test(s)) return s;
  // whole-run base64-ish blob that uses '/' or '+' with mixed case + digits
  if (/[/+]/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s)) return '***';
  // otherwise judge path/word segments separately so long file paths survive
  return s.split(/(\/)/).map((x) => (secretish(x) ? '***' : x)).join('');
}

/** Return text with secrets masked. Never throws. */
export function redact(text) {
  try {
    if (typeof text !== 'string') return text;
    let out = text;
    for (const r of loadVendored()) out = out.replace(r, '***');
    for (const [r, repl] of GENERIC) out = out.replace(r, repl);
    return out.replace(LONG_RUN, longRun);
  } catch {
    return REDACTION_ERROR; // fail closed on content
  }
}
