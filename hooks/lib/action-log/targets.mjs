// targets.mjs — allowlist-only `target` descriptors and tool kinds (port of action_log_lib/targets.py).
//
// Anything not listed returns null (target omitted). Never reads content / old_string / new_string / prompt /
// tool_result bodies.
import os from 'node:os';
import { pyStr, pyTruthy } from '../hook-io.mjs';
import { pyAbspath } from '../pystd.mjs';
import { redact } from './redact.mjs';
import { PY_S, cpHead, pyRstrip, pyStrip } from './py.mjs';
import { hostAndPort, urlsplit } from '../pyurl.mjs';

const KINDS = new Map(
  Object.entries({
    Edit: 'edit', Write: 'edit', NotebookEdit: 'edit', MultiEdit: 'edit', Read: 'read', Grep: 'search', Glob: 'search',
    Bash: 'exec', Task: 'agent', Agent: 'agent', WebFetch: 'web', WebSearch: 'web',
  }),
);
const MCP_ARGS = ['owner', 'repo', 'index', 'pull_number', 'number', 'method', 'state', 'branch', 'ref', 'corpus', 'relative_path',
  'project_id', 'node', 'vmid', 'name', 'path', 'file_path'];
const DROP_ARG = /token|secret|key|pass|auth|cred|content|body|text|prompt|query|data/i; // arg names are ASCII
const ENV_PREFIX = new RegExp(`^[${PY_S}]*(?:[A-Za-z_][A-Za-z0-9_]*=[^${PY_S}]*[${PY_S}]+)+`, 'u');
const ENV_NAME = new RegExp(`([A-Za-z_][A-Za-z0-9_]*)=[^${PY_S}]*`, 'gu');
const BASH_CUT = new RegExp(`<<|\\|[${PY_S}]*base64`, 'u');

export function kindOf(tool) {
  if (KINDS.has(tool)) return KINDS.get(tool);
  return typeof tool === 'string' && tool.startsWith('mcp__') ? 'mcp' : 'other';
}

const clip = (text, n) => cpHead(text, n);
const isStr = (v) => typeof v === 'string';
/** int, float, str or bool (not None / list / dict) */
const scalar = (v) => isStr(v) || typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean';

// ---------------------------------------------------------------- os.path.expanduser("~") / relpath
function homeDir() {
  let home;
  if (process.env.HOME !== undefined) home = process.env.HOME;
  else {
    try {
      home = os.userInfo().homedir;
    } catch {
      return '~';
    }
  }
  return home.replace(/\/+$/, '') || '/';
}

function relpath(p, start) {
  const norm = (x) => pyAbspath(x).replace(/^\/+/, '');
  const startTail = norm(start);
  const pathTail = norm(p);
  const a = startTail ? startTail.split('/') : [];
  const b = pathTail ? pathTail.split('/') : [];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const rel = [...Array(a.length - i).fill('..'), ...b.slice(i)];
  return rel.length ? rel.join('/') : '.';
}

function pathTarget(p, projectDir) {
  if (!isStr(p) || !p) return null;
  if (projectDir && (p === projectDir || p.startsWith(`${projectDir.replace(/\/+$/, '')}/`))) return relpath(p, projectDir);
  const home = homeDir();
  if (home && home !== '/' && (p === home || p.startsWith(`${home}/`))) return `~${p.slice(home.length)}`;
  return p;
}

function webTarget(inp) {
  const url = inp.get('url');
  if (!isStr(url)) return null;
  const u = urlsplit(url);
  const { hostname, port } = hostAndPort(u.netloc);
  let host = hostname || '';
  if (port) host += `:${port}`;
  return u.scheme && host ? `${u.scheme}://${host}${u.path}` : null;
}

// ---------------------------------------------------------------- per-tool descriptors
function bashTarget(inp) {
  const cmd = inp.get('command');
  if (!isStr(cmd)) return null;
  let line = pyStrip(cmd);
  const nl = line.indexOf('\n');
  if (nl >= 0) line = line.slice(0, nl);
  const m0 = BASH_CUT.exec(line);
  line = pyRstrip(m0 ? line.slice(0, m0.index) : line);
  const m = ENV_PREFIX.exec(line);
  if (m) line = m[0].replace(ENV_NAME, (_, name) => `${name}=***`) + line.slice(m[0].length);
  let out = clip(redact(line), 80);
  const desc = inp.get('description');
  if (isStr(desc) && pyStrip(desc)) {
    let d = pyStrip(desc);
    const dn = d.indexOf('\n');
    if (dn >= 0) d = d.slice(0, dn);
    out += ` — ${clip(redact(d), 60)}`;
  }
  return out;
}

function mcpTarget(tool, inp) {
  let rest = tool;
  let short = tool;
  for (let k = 0; k < 2; k++) {
    const i = rest.indexOf('__');
    if (i < 0) break;
    rest = rest.slice(i + 2);
    short = rest;
  }
  const parts = [short];
  for (const name of MCP_ARGS) {
    if (inp.has(name) && !DROP_ARG.test(name)) {
      const v = inp.get(name);
      if (scalar(v)) parts.push(`${name}=${clip(redact(pyStr(v)), 60)}`);
    }
  }
  return parts.join(' ');
}

/** Return a <=120 char redacted descriptor, or null. Never throws. */
export function targetFor(tool, inp, projectDir = null) {
  try {
    if (!(inp instanceof Map)) return null;
    const kind = kindOf(tool);
    let t = null;
    if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit', 'Read'].includes(tool)) {
      t = pathTarget(inp.has('file_path') && pyTruthy(inp.get('file_path')) ? inp.get('file_path') : inp.get('notebook_path'), projectDir);
    } else if (tool === 'Bash') t = bashTarget(inp);
    else if (tool === 'Grep' || tool === 'Glob') {
      const pat = inp.get('pattern');
      if (isStr(pat)) {
        t = clip(pat, 60);
        if (isStr(inp.get('path'))) t += ` in ${pathTarget(inp.get('path'), projectDir) || ''}`;
      }
    } else if (tool === 'Task' || tool === 'Agent') {
      const st = inp.get('subagent_type');
      if (isStr(st)) {
        t = st.replace('scaffolding:', '');
        if (isStr(inp.get('description'))) t += `: ${clip(inp.get('description'), 80)}`;
      }
    } else if (tool === 'WebFetch') t = webTarget(inp);
    else if (tool === 'WebSearch') {
      if (isStr(inp.get('query'))) t = clip(inp.get('query'), 60);
    } else if (kind === 'mcp') t = mcpTarget(tool, inp);
    return t ? clip(redact(t), 120) : null;
  } catch {
    return null; // fail open on the run, omit the target
  }
}
