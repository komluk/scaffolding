// extract.mjs — input adapters: platform output.jsonl and local CLI transcripts -> metadata records
// (port of action_log_lib/extract.py).
//
// Metadata only. `tool_result.content` is NEVER read: status comes from `success` (platform) or `is_error` (local)
// and nothing else. Malformed lines are skipped. Anything python would have raised on (a corrupt cursor, a lone
// surrogate that cannot be written, a timestamp gmtime refuses) throws here too; the CLI turns it into a warning
// and exit 0.
import fs from 'node:fs';
import { pyDumps, pyTruthy } from '../hook-io.mjs';
import { cmpCp, pyAbspath, pyGlob, pyJoin, pyNormpath } from '../pystd.mjs';
import { LOCAL_BUDGET } from './limits.mjs';
import { cpDropLast, eachLine, encodeStrict, loadsBytes, pyInt, pyLt, readTextStrict } from './py.mjs';
import { MAX_BYTES, MAX_RECORDS, agentName, appendLines, applyCaps, dumps, ident, isoTs, keepWhenCapped, makeRecord } from './records.mjs';

const basename = (p) => p.slice(p.lastIndexOf('/') + 1);
const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const exists = (p) => {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
};
const num = (n) => BigInt(n);
/** a dict (Map) or a TypeError, like python's `.get` on anything else */
const dict = (v) => {
  if (!(v instanceof Map)) throw new TypeError('not a dict');
  return v;
};

/** (repo, projectDir|null) from <...>/<X>/conversations/<conv>; X is `.scaffolding` or the repo bucket. */
export function repoAndProject(convDir) {
  const parts = pyAbspath(convDir).split('/');
  if (parts.length >= 4 && parts.at(-2) === 'conversations') {
    if (parts.at(-3) === '.scaffolding') return [parts.at(-4), parts.slice(0, -3).join('/')];
    return [parts.at(-3), null];
  }
  return ['unknown', null];
}

function* iterJson(file) {
  for (const raw of eachLine(file)) {
    let obj;
    try {
      obj = loadsBytes(raw);
    } catch {
      continue;
    }
    if (obj instanceof Map) yield obj;
  }
}

/** step frame -> [kind, inner dict] */
function frameData(obj) {
  const d = obj.get('data');
  if (obj.get('type') === 'step' && d instanceof Map && d.get('data') instanceof Map) return [d.get('type') ?? null, d.get('data')];
  return [null, null];
}

/** [records, footerStatus] from one task's output.jsonl */
export function extractPlatform(streamPath, conv, run, repo, projectDir, defaultAgent = 'main') {
  const ctx = { src: 'platform', conv, run, repo, projectDir };
  const subagents = new Map();
  const byId = new Map();
  const records = [];
  let status = null;
  for (const obj of iterJson(streamPath)) {
    const [kind, data] = frameData(obj);
    if (kind === 'agent_start') {
      const tid = ident(data.get('tool_use_id'));
      const nm = agentName(data.get('agent'), null);
      if (tid && nm) subagents.set(tid, nm);
    } else if (kind === 'tool_call') {
      const parent = ident(data.get('parent_tool_use_id'));
      const agent = parent ? (subagents.has(parent) ? subagents.get(parent) : defaultAgent) : defaultAgent;
      const rec = makeRecord(ctx, records.length + 1, data.get('id'), data.get('tool'), data.get('input'), isoTs(obj.get('ts')), agent, parent);
      records.push(rec);
      if (rec.get('id')) byId.set(rec.get('id'), rec);
    } else if (kind === 'tool_result') {
      const rec = byId.get(ident(data.get('tool_use_id')));
      const ok = data.get('success'); // content deliberately not read
      if (rec !== undefined && typeof ok === 'boolean') rec.set('status', ok ? 'ok' : 'error');
    } else if (obj.get('type') === 'done' && obj.get('data') instanceof Map) {
      const s = obj.get('data').get('status');
      status = s === 'completed' || s === 'failed' || s === 'cancelled' ? s : 'unknown';
    }
  }
  return [records, status];
}

export function footer(ctx, status, calls, errors, truncated) {
  return new Map([
    ['v', 1n], ['run', ctx.run], ['end', true], ['status', pyTruthy(status ?? null) ? status : 'unknown'],
    ['calls', num(calls)], ['errors', num(errors)], ['truncated', num(truncated)],
  ]);
}

/** Write conversations/<conv>/actions/<run>.jsonl. Returns the written path or null. */
export function writePlatform(taskDir, convDir, force = false, agent = 'main') {
  const run = ident(basename(pyNormpath(taskDir)));
  const conv = ident(basename(pyNormpath(convDir)));
  const stream = pyJoin(taskDir, 'output.jsonl');
  if (!run || !conv || !isFile(stream)) return null;
  const [repo, projectDir] = repoAndProject(convDir);
  const outDir = pyJoin(convDir, 'actions');
  const out = pyJoin(outDir, `${run}.jsonl`);
  if (exists(out) && !force) return null;
  const [records, status] = extractPlatform(stream, conv, run, repo, projectDir, agentName(agent));
  const [kept, truncated] = applyCaps(records);
  const errors = kept.filter((r) => r.get('status') === 'error').length;
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = `${out}.tmp.${process.pid}`;
  try {
    appendLines(tmp, [...kept.map(dumps), dumps(footer({ run }, status, records.length, errors, truncated))]);
    fs.renameSync(tmp, out);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return out;
}

// ---------------------------------------------------------------- local
function loadCursor(file) {
  try {
    const cur = loadsBytes(Buffer.from(readTextStrict(fs.readFileSync(file)), 'utf8'));
    return cur instanceof Map ? cur : new Map();
  } catch {
    return new Map();
  }
}

/** Complete lines from `offset`, at most `budget` bytes. Returns [lines, newOffset, resync]. */
function readChunk(file, offset, budget, resync) {
  let buf;
  try {
    const size = fs.statSync(file).size;
    if (offset > size) offset = 0;
    if (offset < 0) throw new Error('EINVAL');
    const fd = fs.openSync(file, 'r');
    try {
      const b = Buffer.allocUnsafe(budget);
      let n = 0;
      while (n < budget) {
        const r = fs.readSync(fd, b, n, budget - n, offset + n);
        if (r === 0) break;
        n += r;
      }
      buf = b.subarray(0, n);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [[], offset, resync];
  }
  if (resync) {
    const nl = buf.indexOf(0x0a);
    if (nl < 0) return [[], offset + buf.length, true];
    buf = buf.subarray(nl + 1);
    offset += nl + 1;
    resync = false;
  }
  const end = buf.lastIndexOf(0x0a);
  if (end < 0) {
    // No full line in the budget: a single huge line. Skip it rather than stall forever.
    return buf.length >= budget ? [[], offset + buf.length, true] : [[], offset, false];
  }
  const lines = [];
  for (let s = 0; ; ) {
    const nl = buf.indexOf(0x0a, s);
    if (nl < 0 || nl >= end) {
      lines.push(buf.subarray(s, end));
      break;
    }
    lines.push(buf.subarray(s, nl));
    s = nl + 1;
  }
  return [lines, offset + end + 1, false];
}

function blocksOf(obj) {
  const msg = obj.get('message');
  const content = msg instanceof Map ? msg.get('content') : null;
  return Array.isArray(content) ? content.filter((b) => b instanceof Map) : [];
}

const seqOf = (r) => {
  if (!(r instanceof Map) || !r.has('seq')) throw new TypeError('no seq');
  return r.get('seq');
};

/** Incrementally append new tool calls since the last pass. Returns the number of records written. */
export function extractLocal(transcript, sessionId, convDir, projectDir, final = false) {
  const sid = ident(sessionId);
  if (!sid || !isFile(transcript)) return 0;
  const repo = projectDir ? basename(pyAbspath(projectDir)) : repoAndProject(convDir)[0];
  const ctx = { src: 'local', conv: sid, run: sid, repo, projectDir };
  const outDir = pyJoin(convDir, 'actions');
  fs.mkdirSync(outDir, { recursive: true });
  const curPath = pyJoin(outDir, '.cursor.json');
  const cur = loadCursor(curPath);
  const files = cur.has('files') ? cur.get('files') : new Map();
  let pending = cur.has('pending') ? cur.get('pending') : new Map();
  const [seq0, count0, size0, trunc0] = ['seq', 'count', 'bytes', 'truncated'].map((k) => pyInt(cur.has(k) ? cur.get(k) : 0n));
  let seq = seq0;
  let count = count0;
  let size = size0;
  let truncated = trunc0;
  const sources = [[transcript, 'main', null]];
  const subs = pyGlob(pyJoin(cpDropLast(transcript, 6), 'subagents', 'agent-*.jsonl')).sort(cmpCp);
  for (const sub of subs) {
    let meta = new Map();
    try {
      meta = loadsBytes(Buffer.from(readTextStrict(fs.readFileSync(`${cpDropLast(sub, 6)}.meta.json`)), 'utf8'));
    } catch {
      /* OSError / ValueError: no meta */
    }
    dict(meta);
    sources.push([sub, agentName(meta.get('agentType') ?? null, 'subagent'), ident(meta.get('toolUseId') ?? null)]);
  }
  let budget = LOCAL_BUDGET;
  const linesOut = [];

  const emit = (rec) => {
    const line = dumps(rec);
    const n = encodeStrict(line).length + 1;
    if ((count >= MAX_RECORDS || size + n > MAX_BYTES) && !keepWhenCapped(rec)) {
      truncated++;
      return;
    }
    count++;
    size += n;
    linesOut.push(line);
  };

  for (const [file, agent, parent] of sources) {
    if (budget <= 0) break;
    const st = dict(files).has(file) ? files.get(file) : new Map();
    const off0 = pyInt(dict(st).has('off') ? st.get('off') : 0n);
    const [lines, off, resync] = readChunk(file, off0, budget, pyTruthy(st.get('resync') ?? null));
    budget -= Math.max(0, off - pyInt(st.has('off') ? st.get('off') : 0n));
    files.set(file, new Map([['off', num(off)], ['resync', resync]]));
    for (const raw of lines) {
      if (!raw.includes('"tool_use"') && !raw.includes('"tool_result"')) continue;
      let obj;
      try {
        obj = loadsBytes(raw);
      } catch {
        continue;
      }
      if (!(obj instanceof Map)) continue;
      for (const b of blocksOf(obj)) {
        if (b.get('type') === 'tool_use') {
          seq++;
          const rec = makeRecord(ctx, seq, b.get('id'), b.get('name'), b.get('input'), isoTs(obj.get('timestamp')), agent, parent);
          if (rec.get('id')) {
            if (!(pending instanceof Map)) throw new TypeError('pending is not a dict');
            pending.set(rec.get('id'), rec);
          } else emit(rec);
        } else if (b.get('type') === 'tool_result') {
          if (!(pending instanceof Map)) throw new TypeError('pending is not a dict');
          const key = ident(b.get('tool_use_id')) || '';
          const rec = pending.get(key);
          pending.delete(key);
          if (rec !== undefined && rec !== null) {
            rec.set('status', b.get('is_error') === true ? 'error' : 'ok'); // content deliberately not read
            emit(rec);
          }
        }
      }
    }
  }
  if (final) {
    if (!(pending instanceof Map)) throw new TypeError('pending is not a dict');
    const left = [...pending.values()];
    left.forEach(seqOf);
    left.sort((a, b) => (pyLt(seqOf(a), seqOf(b)) ? -1 : pyLt(seqOf(b), seqOf(a)) ? 1 : 0));
    for (const rec of left) emit(rec);
    pending = new Map();
    const errors = linesOut.filter((ln) => ln.includes('"status":"error"')).length;
    linesOut.push(dumps(footer(ctx, 'completed', seq, errors, truncated)));
  }
  if (linesOut.length) appendLines(pyJoin(outDir, `${sid}.jsonl`), linesOut);
  for (const [k, v] of [['files', files], ['pending', pending], ['seq', num(seq)], ['count', num(count)], ['bytes', num(size)], ['truncated', num(truncated)]]) cur.set(k, v);
  const tmp = `${curPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, encodeStrict(pyDumps(cur)), { mode: 0o666 });
  fs.renameSync(tmp, curPath);
  return linesOut.length;
}
