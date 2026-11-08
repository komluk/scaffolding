// records.mjs — record construction, caps and write helpers for the episodic action log (port of action_log_lib/records.py).
//
// Metadata only: a record is built from an explicit set of scalar fields plus the allowlisted `target`
// (targets.mjs). Raw tool input / output never reaches here. Records are Maps (JSON objects read back from the
// cursor are Maps too); integers are BigInt and floats Number, exactly as parseJson hands them out, so that
// dumps() prints `5`, never `5.0`.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { listdirRaw, pyMtime } from '../pystd.mjs';
import { D, dumps as dump, encodeStrict, pyEq } from './py.mjs';
import { kindOf, targetFor } from './targets.mjs';

export const SCHEMA_V = 1;
export const MAX_RECORDS = 5000;
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_CONV_BYTES = 50 * 1024 * 1024;
const KEEP_KINDS = ['edit', 'exec', 'agent'];

// python's `$` also matches before one trailing newline, and `\d` is any Unicode decimal digit
const IDENT = /^[A-Za-z0-9._:@-]{1,80}\n?$/;
const ISO = new RegExp(`^${D}{4}-${D}{2}-${D}{2}T${D}{2}:${D}{2}:${D}{2}(?:\\.${D}{1,6})?Z\\n?$`, 'u');

/** A short identifier safe to store verbatim, else dflt. */
export const ident = (value, dflt = null) => (typeof value === 'string' && IDENT.test(value) ? value : dflt);

export function agentName(value, dflt = 'main') {
  if (typeof value === 'string') value = value.replace('scaffolding:', '');
  return ident(value, dflt);
}

// ---------------------------------------------------------------- time.gmtime / strftime for the epoch seconds of a platform frame
const MIN_YEAR = -2147481748n; // what the libc struct tm (int tm_year) can hold
const MAX_YEAR = 2147483647n;
const floorDiv = (a, b) => (a >= 0n ? a / b : -((-a + b - 1n) / b));

/** proleptic Gregorian civil date from days since 1970-01-01 (Hinnant) */
function civil(days) {
  const z = days + 719468n;
  const era = floorDiv(z, 146097n);
  const doe = z - era * 146097n;
  const yoe = (doe - doe / 1460n + doe / 36524n - doe / 146096n) / 365n;
  const doy = doe - (365n * yoe + yoe / 4n - yoe / 100n);
  const mp = (5n * doy + 2n) / 153n;
  const d = doy - (153n * mp + 2n) / 5n + 1n;
  const m = mp < 10n ? mp + 3n : mp - 9n;
  return [yoe + era * 400n + (m <= 2n ? 1n : 0n), m, d];
}

/** Epoch seconds (platform) or an ISO-8601 Z string (local) -> ISO string, else null. Throws where python's gmtime does. */
export function isoTs(value) {
  if (typeof value === 'boolean') return null;
  if (typeof value === 'bigint' || typeof value === 'number') {
    let secs;
    let frac = 0;
    if (typeof value === 'bigint') secs = value;
    else {
      if (!Number.isFinite(value)) throw new RangeError('timestamp out of range');
      secs = BigInt(Math.floor(value));
      let mod = value % 1;
      if (mod !== 0 && mod < 0) mod += 1;
      frac = Math.trunc(mod * 1000);
    }
    const days = floorDiv(secs, 86400n);
    const rem = secs - days * 86400n;
    const [y, mo, d] = civil(days);
    if (y < MIN_YEAR || y > MAX_YEAR) throw new RangeError('timestamp out of range for platform time_t');
    const p2 = (n) => String(n).padStart(2, '0');
    const hh = rem / 3600n;
    const mm = (rem % 3600n) / 60n;
    const ss = rem % 60n;
    return `${y}-${p2(mo)}-${p2(d)}T${p2(hh)}:${p2(mm)}:${p2(ss)}.${String(frac).padStart(3, '0')}Z`;
  }
  if (typeof value === 'string' && ISO.test(value)) return value;
  return null;
}

/** ctx: { src, conv, run, repo, projectDir } */
export function makeRecord(ctx, seq, toolId, tool, inp, ts, agent, parent, status = 'unknown') {
  tool = ident(tool, 'other');
  const rec = new Map([
    ['v', BigInt(SCHEMA_V)], ['ts', ts], ['src', ctx.src], ['conv', ctx.conv], ['run', ctx.run], ['repo', ctx.repo],
    ['agent', agent], ['parent', parent], ['seq', BigInt(seq)], ['id', ident(toolId)], ['tool', tool], ['kind', kindOf(tool)],
  ]);
  const target = targetFor(tool, inp, ctx.projectDir);
  if (target) rec.set('target', target);
  rec.set('status', status);
  return rec;
}

export const keepWhenCapped = (rec) => pyEq(rec.get('status') ?? null, 'error') || KEEP_KINDS.some((k) => pyEq(rec.get('kind') ?? null, k));

export const dumps = dump;

export function applyCaps(records) {
  const kept = [];
  let size = 0;
  let truncated = 0;
  for (const rec of records) {
    const lineLen = encodeStrict(dumps(rec)).length + 1;
    if ((kept.length >= MAX_RECORDS || size + lineLen > MAX_BYTES) && !keepWhenCapped(rec)) {
      truncated++;
      continue;
    }
    kept.push(rec);
    size += lineLen;
  }
  return [kept, truncated];
}

/** One write per line on an O_APPEND fd (single-line atomic appends, NFS-safe). */
export function appendLines(file, lines) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND, 0o664);
  try {
    for (const line of lines) fs.writeSync(fd, encodeStrict(`${line}\n`));
  } finally {
    fs.closeSync(fd);
  }
}

export function atomicWrite(file, text) {
  const tmp = `${file}.tmp.${process.pid}`;
  try {
    const data = encodeStrict(text);
    fs.writeFileSync(tmp, data, { mode: 0o666 });
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Over `limit` bytes per conversation: gzip the oldest run files (never deleted). */
export function rotate(actionsDir, keepName = null, limit = MAX_CONV_BYTES) {
  try {
    const files = listdirRaw(actionsDir)
      .filter((n) => n.endsWith('.jsonl') || n.endsWith('.jsonl.gz'))
      .map((n) => path.join(actionsDir, n));
    if (!fs.existsSync(actionsDir)) return; // python: os.listdir raises OSError
    let total = files.reduce((acc, f) => acc + fs.statSync(f).size, 0);
    const plain = files.filter((f) => f.endsWith('.jsonl')).map((f) => [f, pyMtime(f)]);
    plain.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)); // stable, like sorted(key=getmtime)
    for (const [f] of plain) {
      if (total <= limit) break;
      if (path.basename(f) === keepName) continue;
      const before = fs.statSync(f).size;
      fs.writeFileSync(`${f}.gz`, zlib.gzipSync(fs.readFileSync(f), { level: 9 }), { mode: 0o666 }); // same content as python's gzip.open; the deflate bytes differ (zlib builds)
      fs.unlinkSync(f);
      total += fs.statSync(`${f}.gz`).size - before;
    }
  } catch {
    /* OSError: leave whatever is there */
  }
}
