// render.mjs — deterministic per-conversation timeline.md from actions/*.jsonl, no LLM (port of action_log_lib/render.py).
//
// Redaction pass #2 runs over every rendered line. Output is capped at 200 lines. Record fields come from files
// on disk, so every place python would raise on an odd type (unhashable Counter key, str ops on a number, `<` on
// mixed types) throws here too; the CLI turns that into a warning and exit 0.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseJson, pyStr, pyTruthy } from '../hook-io.mjs';
import { cmpCp, pyGlob, pyJoin, pyNormpath } from '../pystd.mjs';
import { D, WB, cpHead, cpSlice, pyKey, pyLt, pyRstrip } from './py.mjs';
import { atomicWrite } from './records.mjs';
import { redact } from './redact.mjs';

const MAX_LINES = 200;
const FULL_RUNS = 10;
const NORM = new RegExp(`${WB}${D}+${WB}|${WB}[0-9a-fA-F]{7,40}${WB}`, 'gu');
const basename = (p) => p.slice(p.lastIndexOf('/') + 1);

const need = (cond) => {
  if (!cond) throw new TypeError('unsupported operand type');
};
const getr = (r, k, d = null) => (r.has(k) ? r.get(k) : d);
const str = (v) => pyStr(v);
const cmpVals = (a, b) => (pyLt(a, b) ? -1 : pyLt(b, a) ? 1 : 0);

/** collections.Counter over python-hashable keys; keeps the first key object and insertion order */
class Counter {
  /** hash: key -> string; python raises TypeError for an unhashable key, and so does pyKey */
  constructor(hash = pyKey) {
    this.m = new Map();
    this.hash = hash;
  }

  add(k, by = 1) {
    const h = this.hash(k);
    const e = this.m.get(h);
    if (e) e.n += by;
    else this.m.set(h, { k, n: by });
  }

  items() {
    return [...this.m.values()].map((e) => [e.k, e.n]);
  }

  mostCommon(n) {
    return this.items().map((e, i) => [e, i]).sort((a, b) => b[0][1] - a[0][1] || a[1] - b[1]).slice(0, n).map(([e]) => e);
  }
}

/**
 * Records of a (possibly gzipped) run file, like python's `for line in gzip.open/open(path, "rt")` + json.loads:
 * an OSError / BadGzipFile / EOFError ends the iteration (a truncated or corrupt gzip still yields the complete lines
 * decoded before the error), a UnicodeDecodeError propagates (the whole render fails, fail-open in the CLI).
 */
function readRecords(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return [];
  }
  let cut = false;
  if (file.endsWith('.gz')) {
    try {
      buf = zlib.gunzipSync(buf);
    } catch {
      try {
        buf = zlib.gunzipSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      } catch {
        return [];
      }
      cut = true;
    }
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const last = lines.pop(); // text after the final newline: a line only when the stream ended cleanly
  if (last !== '' && !cut) lines.push(last);
  const out = [];
  for (const line of lines) {
    let obj;
    try {
      obj = parseJson(line);
    } catch {
      continue;
    }
    if (obj instanceof Map) out.push(obj);
  }
  return out;
}

export function loadRuns(convDir) {
  const runs = [];
  for (const p of pyGlob(pyJoin(convDir, 'actions', '*.jsonl*')).sort(cmpCp)) {
    if (basename(p).startsWith('.')) continue;
    const all = readRecords(p);
    const recs = all.filter((o) => !pyTruthy(getr(o, 'end')));
    const foot = all.find((o) => pyTruthy(getr(o, 'end'))) ?? new Map();
    if (recs.length) {
      const run = getr(recs[0], 'run');
      runs.push({ run: pyTruthy(run) ? run : basename(p), recs, status: getr(foot, 'status', 'unknown') });
    }
  }
  const key = (r) => {
    const ts = getr(r.recs[0], 'ts');
    return pyTruthy(ts) ? ts : '';
  };
  runs.sort((a, b) => cmpVals(key(a), key(b)));
  return runs;
}

function tgt(r) {
  const t = getr(r, 'target');
  if (pyTruthy(t)) return t;
  const tool = getr(r, 'tool');
  return pyTruthy(tool) ? tool : '?';
}

function norm(r) {
  const t = tgt(r);
  need(typeof t === 'string');
  return [getr(r, 'tool'), t.replace(NORM, 'N')];
}

/** a python tuple of hashable items as a Counter key: [tool, target] */
const tupleHash = (k) => `t${k.map(pyKey).join('\u0000')}`;

/** {key: n} for failures that happened at least twice, as [[tool, target], n] pairs in first-seen order */
export function repeated(recs) {
  const c = new Counter(tupleHash);
  for (const r of recs) if (getr(r, 'status') === 'error') c.add(norm(r));
  return c.items().filter(([, n]) => n >= 2);
}

const tupleCmp = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (pyKey(a[i]) !== pyKey(b[i])) return cmpVals(a[i], b[i]);
  }
  return a.length - b.length;
};
const sortedRep = (items) => items.slice().sort((x, y) => tupleCmp(x[0], y[0]));
const repText = (items) => items.map(([k, n]) => `${str(k[0])} ${str(k[1])} ×${n}`);

function uniq(items, cap) {
  const seen = new Set();
  const out = [];
  for (const i of items) {
    const h = pyKey(i);
    if (!seen.has(h)) {
      seen.add(h);
      out.push(i);
    }
  }
  return [out.slice(0, cap), Math.max(0, out.length - cap)];
}

function span(recs) {
  const ts = recs.filter((r) => pyTruthy(getr(r, 'ts'))).map((r) => r.get('ts'));
  if (!ts.length) return ['?', '?'];
  let lo = ts[0];
  let hi = ts[0];
  for (const t of ts.slice(1)) {
    if (pyLt(t, lo)) lo = t;
    if (pyLt(hi, t)) hi = t;
  }
  return [lo, hi];
}

function hm(ts) {
  if (!pyTruthy(ts) || ts === '?') return '?';
  need(typeof ts === 'string');
  return cpSlice(ts, 11, 16);
}
const head10 = (ts) => {
  need(typeof ts === 'string');
  return cpHead(ts, 10);
};
const joinStr = (sep, items) => {
  items.forEach((i) => need(typeof i === 'string'));
  return items.join(sep);
};
const sortBy = (arr, keyFn) => arr.map((x, i) => [x, keyFn(x), i]).sort((a, b) => cmpVals(a[1], b[1]) || a[2] - b[2]).map((e) => e[0]);

function section(run) {
  const recs = run.recs;
  const [lo, hi] = span(recs);
  const errs = recs.filter((r) => getr(r, 'status') === 'error');
  const agentSet = new Map();
  for (const r of recs) {
    const a = pyTruthy(getr(r, 'agent')) ? r.get('agent') : 'main';
    agentSet.set(pyKey(a), a);
  }
  const agents = sortBy([...agentSet.values()], (x) => x);
  const out = [
    `## Run ${cpHead(str(run.run), 8)} — ${joinStr(', ', agents)} — ${head10(lo)} ${hm(lo)}–${hm(hi)} — ${str(run.status)} (${recs.length} calls, ${errs.length} errors)`,
  ];
  const kinds = new Counter();
  for (const r of recs) kinds.add(getr(r, 'kind'));
  out.push(`- calls by kind: ${sortBy(kinds.items(), ([k]) => str(k)).map(([k, n]) => `${str(k)} ${n}`).join(', ')}`);
  const [edited, moreE] = uniq(recs.filter((r) => getr(r, 'kind') === 'edit').map(tgt), 30);
  out.push(`- files edited: ${edited.length ? joinStr(', ', edited) + (moreE ? ` (+${moreE})` : '') : '—'}`);
  const reads = new Counter();
  for (const r of recs) if (getr(r, 'kind') === 'read') reads.add(tgt(r));
  const nReads = reads.items().reduce((a, [, n]) => a + n, 0);
  out.push(`- files read: ${nReads} (top: ${joinStr(', ', reads.mostCommon(10).map(([p]) => p)) || '—'})`);
  const [cmds, moreC] = uniq(recs.filter((r) => getr(r, 'kind') === 'exec').map(tgt), 20);
  out.push(`- commands: ${cmds.length ? joinStr(' ; ', cmds) + (moreC ? ` (+${moreC})` : '') : '—'}`);
  const [mcp, moreM] = uniq(recs.filter((r) => getr(r, 'kind') === 'mcp').map(tgt), 15);
  out.push(`- mcp: ${mcp.length ? joinStr(' ; ', mcp) + (moreM ? ` (+${moreM})` : '') : '—'}`);
  const [subs] = uniq(recs.filter((r) => getr(r, 'kind') === 'agent').map(tgt), 10);
  out.push(`- subagents: ${subs.length ? joinStr('; ', subs) : '—'}`);
  out.push(`- errors: ${errs.length ? errs.slice(0, 20).map((r) => `${hm(getr(r, 'ts'))} ${str(getr(r, 'tool'))} ${str(tgt(r))}`).join('; ') : '—'}`);
  const rep = repeated(recs);
  out.push(`- repeated failures: ${rep.length ? repText(sortedRep(rep)).join('; ') : '—'}`);
  return out;
}

export function renderText(convDir) {
  const runs = loadRuns(convDir);
  if (!runs.length) return null;
  const allrecs = runs.flatMap((r) => r.recs);
  const spans = runs.map((r) => span(r.recs));
  let lo = spans[0][0];
  let hi = spans[0][1];
  for (const [a, b] of spans.slice(1)) {
    if (pyLt(a, lo)) lo = a;
    if (pyLt(hi, b)) hi = b;
  }
  const errors = allrecs.filter((r) => getr(r, 'status') === 'error').length;
  const repo = getr(allrecs[0], 'repo', 'unknown');
  let lines = [
    `# Action timeline — ${str(repo)} — conversation ${basename(pyNormpath(convDir))}`,
    `runs: ${runs.length} · ${head10(lo)} ${hm(lo)} → ${head10(hi)} ${hm(hi)} UTC · calls ${allrecs.length} · errors ${errors}`,
  ];
  const agg = new Counter(tupleHash);
  for (const run of runs) for (const [k, n] of repeated(run.recs)) agg.add(k, n);
  if (agg.items().length) lines.push(`repeated failures (all runs): ${repText(sortedRep(agg.items()).slice(0, 10)).join('; ')}`);
  lines.push('');
  const recent = runs.slice(-FULL_RUNS);
  const older = runs.slice(0, Math.max(0, runs.length - FULL_RUNS));
  for (const run of older) {
    const [lo2] = span(run.recs);
    lines.push(
      `- run ${cpHead(str(run.run), 8)} ${head10(lo2)} ${str(run.status)} — ${run.recs.length} calls, ${run.recs.filter((r) => getr(r, 'status') === 'error').length} errors`,
    );
  }
  if (older.length) lines.push('');
  for (const run of recent.slice().reverse()) {
    lines.push(...section(run), '');
  }
  lines = lines.map((ln) => redact(ln));
  if (lines.length > MAX_LINES) lines = [...lines.slice(0, MAX_LINES - 1), `… truncated at ${MAX_LINES} lines`];
  return `${pyRstrip(lines.join('\n'))}\n`;
}

/** Write conversations/<conv>/timeline.md atomically. Returns [path, calls, errors] or null. */
export function render(convDir) {
  const text = renderText(convDir);
  if (text === null) return null;
  const file = pyJoin(convDir, 'timeline.md');
  atomicWrite(file, text);
  const recs = loadRuns(convDir).flatMap((r) => r.recs);
  return [file, recs.length, recs.filter((r) => getr(r, 'status') === 'error').length];
}
