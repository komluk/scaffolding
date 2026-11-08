#!/usr/bin/env node
// Golden-output parity runner for the simple hooks.
//
//   node run.mjs record  --hooks DIR [--only hook.sh]   (re)write golden/<hook>.json from DIR's hooks
//   node run.mjs compare [--hooks DIR] [--only hook.sh]  run hooks, compare with golden/ (exit 1 on any diff)
//
// golden/*.json was recorded from the PYTHON implementation (v2.34.0) before the Node port. `compare`
// runs with NO python3 on PATH, which also proves the ported hooks no longer need it.
//
// cases/*.mjs export { hook, helper?, cases: [{ name, stdin|stdin_b64, env, files{}, setup[], after[] }] }.
// A spec with helper:true runs helpers/<hook> instead of a plugin hook: tiny wrappers around the json
// one-liners the hooks used (quote, emit-block); they run the python line against a python hooks dir
// (record) and hook-io against the ported one (compare).
// Each case runs in a fresh sandbox (cwd) with a fixed environment and a PATH made only of symlinks to
// the tools in TOOLS (+ node, + python3 when recording). Placeholders in stdin/env/setup/after:
// @SANDBOX@ @TASK@. `after` stdout is captured as `state` (resulting files). Output is normalised
// (sandbox path, task id, dates/timestamps, git hashes, path-hash project ids, bash NUL warning); a case with
// keepDates:true keeps dates and timestamps verbatim (the action log renders them and they are what is compared).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (mode !== 'record' && mode !== 'compare') {
  console.error('usage: run.mjs record --hooks DIR | compare [--hooks DIR] [--only hook.sh]');
  process.exit(2);
}
if (mode === 'record' && !opt('--hooks')) {
  console.error('record needs --hooks DIR (the pristine python hooks); refusing to guess');
  process.exit(2);
}
const hooksDir = path.resolve(opt('--hooks') ?? process.env.HOOKS_DIR ?? path.join(here, '../../../hooks'));
const only = opt('--only');
const goldenDir = path.join(here, 'golden');
const withPython = mode === 'record';

const TOOLS = `bash sh git grep egrep sed cat wc tr head tail find date stat mkdir mktemp touch cut
  basename dirname readlink ln rm rmdir cp mv env sleep timeout awk sort uniq ls chmod id uname expr tee xargs seq od
  true false test printf echo truncate gzip zcat flock sha256sum`.split(/\s+/);
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
};
const VAULT_STUB = '#!/bin/sh\n[ -n "${FAKE_VAULT_TOKEN+x}" ] || exit 1\nprintf \'%s\' "$FAKE_VAULT_TOKEN"\n';

function findTool(name) {
  for (const d of ['/usr/bin', '/bin', '/usr/local/bin']) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function normalise(buf, ctx) {
  let s;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return { b64: Buffer.from(buf).toString('base64') };
  }
  const h16 = (p) => createHash('sha256').update(p).digest('hex').slice(0, 16);
  s = s.replace(/^.*warning: command substitution: ignored null byte in input\n/gm, ''); // bash text carries script path + line
  // project ids fall back to sha256(<abs project dir>)[:16]: mask only when it equals that exact hash
  for (const [label, dir] of ctx.dirs) s = s.replaceAll(`scaffold:${h16(dir)}`, `scaffold:@HASH:${label}@`);
  s = s.replaceAll(ctx.hooksDir, '@HOOKS@').replaceAll(ctx.sandbox, '@SANDBOX@').replaceAll(ctx.task, '@TASK@');
  if (!ctx.keepDates) {
    s = s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, '@TS@');
    s = s.replace(/\d{4}-\d{2}-\d{2}/g, '@DATE@');
  }
  s = s.replace(/\b[0-9a-f]{40}\b/g, '@SHA@').replace(/HEAD is now at [0-9a-f]+/g, 'HEAD is now at @H@');
  return s;
}

function runCase(hookFile, c, idx, helper) {
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'parity-')));
  const task = `parity-${process.pid}-${idx}`;
  const sub = (s) => s.replaceAll('@SANDBOX@', sandbox).replaceAll('@TASK@', task);
  const storeFile = `/tmp/scaffolding-mtime-${task}.json`;
  try {
    fs.mkdirSync(path.join(sandbox, 'home'));
    const bin = path.join(sandbox, 'bin');
    fs.mkdirSync(bin);
    for (const t of withPython ? [...TOOLS, 'python3'] : TOOLS) {
      const p = findTool(t);
      if (p) fs.symlinkSync(p, path.join(bin, t));
    }
    fs.symlinkSync(process.execPath, path.join(bin, 'node'));
    fs.writeFileSync(path.join(bin, 'vault'), VAULT_STUB, { mode: 0o755 });
    const base = { PATH: bin, HOME: `${sandbox}/home`, LC_ALL: 'C.UTF-8', TZ: 'UTC', ...GIT_ENV };
    const env = { ...base };
    for (const [k, v] of Object.entries(c.env ?? {})) {
      if (v === null) delete env[k];
      else env[k] = sub(v);
    }
    const aux = { ...base, TASK: task, SANDBOX: sandbox };
    const sh = (lines) =>
      spawnSync('bash', ['-c', sub(lines.join('\n'))], { cwd: sandbox, env: aux, encoding: 'buffer', timeout: 30000 });
    // files: { relPath: string | Buffer } written under the sandbox before setup (strings get the placeholders; big or binary inputs)
    for (const [rel, content] of Object.entries(c.files ?? {})) {
      const f = path.join(sandbox, sub(rel));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, typeof content === 'string' ? sub(content) : content);
    }
    if (c.setup?.length) {
      const r = sh(c.setup);
      if (r.status !== 0) throw new Error(`setup failed for ${hookFile}/${c.name} (${r.status}): ${r.stderr}`);
    }
    let input = Buffer.alloc(0);
    if (c.stdin_b64 !== undefined) input = Buffer.from(sub(Buffer.from(c.stdin_b64, 'base64').toString('latin1')), 'latin1'); // latin1 round-trip keeps raw bytes intact
    else if (c.stdin !== undefined) {
      input = Buffer.from(sub(typeof c.stdin === 'string' ? c.stdin : JSON.stringify(c.stdin)), 'utf8');
    }
    // helper scripts (spec.helper) live next to this runner and pick python or hook-io by what HOOKS_DIR holds
    const script = helper ? path.join(here, 'helpers', hookFile) : path.join(hooksDir, hookFile);
    const r = spawnSync('bash', [script], {
      cwd: sandbox,
      env: helper ? { ...env, HOOKS_DIR: hooksDir } : env,
      input,
      encoding: 'buffer',
      timeout: 30000,
    });
    const dirs = [['cwd', sandbox]];
    if (env.CLAUDE_PROJECT_DIR) dirs.unshift(['projdir', env.CLAUDE_PROJECT_DIR]);
    const ctx = { sandbox, task, dirs, hooksDir, keepDates: c.keepDates === true };
    const state = c.after?.length ? sh(c.after).stdout : Buffer.alloc(0);
    return {
      code: r.status ?? `signal:${r.signal}`,
      stdout: normalise(r.stdout, ctx),
      stderr: normalise(r.stderr, ctx),
      state: normalise(state, ctx),
    };
  } finally {
    spawnSync('chmod', ['-R', 'u+rwX', sandbox]); // cases may leave read-only dirs behind
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(storeFile, { force: true });
  }
}

// basename's own error text differs by coreutils flavour (GNU vs uutils) and cannot be controlled by the
// hook. In compare mode only, rewrite those tool-emitted lines to a token on both sides; exit code, stdout,
// state and every stderr line the hook prints itself stay compared exactly.
const TOOL_STDERR = [
  /error: unexpected argument[\s\S]*?For more information, try '--help'\.\n/g,
  /basename: [^\n]*\nTry 'basename --help' for more information\.\n/g,
];
const toolNorm = (s) => TOOL_STDERR.reduce((acc, re) => acc.replace(re, '<tool:basename>\n'), s);

const brief = (v) => {
  const s = JSON.stringify(v);
  return s.length > 600 ? `${s.slice(0, 600)}...` : s;
};

fs.mkdirSync(goldenDir, { recursive: true });
const specs = [];
for (const f of fs.readdirSync(path.join(here, 'cases')).filter((n) => n.endsWith('.mjs') && !n.startsWith('_')).sort()) {
  const mod = await import(path.join(here, 'cases', f));
  specs.push(...mod.default);
}
let pass = 0;
let fail = 0;
for (const spec of specs) {
  if (only && spec.hook !== only) continue;
  const goldenPath = path.join(goldenDir, `${spec.hook}.json`);
  const golden = mode === 'compare' ? JSON.parse(fs.readFileSync(goldenPath, 'utf8')) : {};
  const seen = new Set();
  console.log(`# ${spec.hook} (${spec.cases.length} cases)`);
  spec.cases.forEach((c, idx) => {
    if (seen.has(c.name)) throw new Error(`duplicate case name ${spec.hook}/${c.name}`);
    seen.add(c.name);
    const got = runCase(spec.hook, c, idx, spec.helper);
    if (mode === 'record') {
      golden[c.name] = got;
      return;
    }
    const want = golden[c.name];
    const norm = (o) => (o ? { ...o, stderr: toolNorm(o.stderr) } : o);
    const g = norm(got);
    const w = norm(want);
    const diffs = want ? Object.keys(g).filter((k) => JSON.stringify(g[k]) !== JSON.stringify(w[k])) : ['missing-golden'];
    if (diffs.length === 0) {
      pass++;
      console.log(`  ok   - ${c.name}`);
    } else {
      fail++;
      console.log(`  FAIL - ${c.name}`);
      for (const k of diffs) {
        console.log(`         ${k}: want ${brief(want?.[k])}`);
        console.log(`         ${k}: got  ${brief(got[k])}`);
      }
    }
  });
  if (mode === 'record') fs.writeFileSync(goldenPath, `${JSON.stringify(golden, null, 1)}\n`);
  else {
    for (const name of Object.keys(golden)) {
      if (!seen.has(name)) {
        fail++;
        console.log(`  FAIL - ${name}: golden entry without a case`);
      }
    }
  }
}
if (mode === 'record') console.log('recorded goldens from', hooksDir);
else {
  console.log(`passed=${pass} failed=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}
