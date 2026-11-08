// targets.mjs — allowlist-only `target` descriptors and tool kinds (port of action_log_lib/targets.py).
//
// Anything not listed returns null (target omitted). Never reads content / old_string / new_string / prompt /
// tool_result bodies.
import os from 'node:os';
import { pyStr, pyTruthy } from '../hook-io.mjs';
import { pyAbspath } from '../pystd.mjs';
import { redact } from './redact.mjs';
import { PY_S, cpHead, pyRstrip, pyStrip } from './py.mjs';

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

// ---------------------------------------------------------------- urllib.parse.urlsplit (3.14) — only what _web reads
class UrlError extends Error {}
const fail = (m) => {
  throw new UrlError(m);
};

function parseV4(s) {
  const octets = s.split('.');
  if (octets.length !== 4) return false;
  return octets.every((o) => /^[0-9]{1,3}$/.test(o) && (o === '0' || o[0] !== '0') && Number(o) <= 255);
}

/** ipaddress.IPv6Address(s) validity (scope id allowed) */
function validV6(s) {
  if (s.includes('/')) return false;
  const pct = s.indexOf('%');
  let addr = s;
  if (pct >= 0) {
    const scope = s.slice(pct + 1);
    if (!scope || scope.includes('%')) return false;
    addr = s.slice(0, pct);
  }
  if (!addr || addr.length > 45) return false;
  const parts = [];
  let rest = addr;
  for (let k = 0; k < 9; k++) {
    const i = rest.indexOf(':');
    if (i < 0) break;
    parts.push(rest.slice(0, i));
    rest = rest.slice(i + 1);
  }
  parts.push(rest);
  if (parts.length < 3) return false;
  if (parts.at(-1).includes('.')) {
    if (!parseV4(parts.pop())) return false;
    parts.push('0', '0');
  }
  if (parts.length > 9) return false;
  let skip = null;
  for (let i = 1; i < parts.length - 1; i++) {
    if (!parts[i]) {
      if (skip !== null) return false;
      skip = i;
    }
  }
  let hi;
  let lo;
  if (skip !== null) {
    hi = skip;
    lo = parts.length - skip - 1;
    if (!parts[0]) {
      hi--;
      if (hi) return false;
    }
    if (!parts.at(-1)) {
      lo--;
      if (lo) return false;
    }
    if (8 - (hi + lo) < 1) return false;
  } else {
    if (parts.length !== 8 || !parts[0] || !parts.at(-1)) return false;
    hi = parts.length;
    lo = 0;
  }
  const hextet = (h) => /^[0-9a-fA-F]{1,4}$/.test(h);
  for (let i = 0; i < hi; i++) if (!hextet(parts[i])) return false;
  for (let i = parts.length - lo; i < parts.length && lo; i++) if (!hextet(parts[i])) return false;
  return true;
}

function checkBracketedNetloc(netloc) {
  const hp = netloc.slice(netloc.lastIndexOf('@') + 1);
  const ob = hp.indexOf('[');
  let hostname;
  if (ob >= 0) {
    if (ob > 0) fail('Invalid IPv6 URL');
    const bracketed = hp.slice(ob + 1);
    const cb = bracketed.indexOf(']');
    hostname = cb < 0 ? bracketed : bracketed.slice(0, cb);
    const port = cb < 0 ? '' : bracketed.slice(cb + 1);
    if (port && !port.startsWith(':')) fail('Invalid IPv6 URL');
  } else {
    const c = hp.indexOf(':');
    hostname = c < 0 ? hp : hp.slice(0, c);
  }
  if (hostname.startsWith('v')) {
    if (!/^v[a-fA-F0-9]+\.[^\n]+$/u.test(hostname)) fail('IPvFuture address is invalid');
  } else if (!validV6(hostname)) fail('not an IPv6 address');
}

function checkNetloc(netloc) {
  if (!netloc || !/[^\x00-\x7f]/.test(netloc)) return;
  const n = netloc.replace(/[@:#?]/g, '');
  const n2 = n.normalize('NFKC');
  if (n === n2) return;
  for (const c of '/?#@:') if (n2.includes(c)) fail('invalid characters under NFKC normalization');
}

/** { scheme, hostname, port, path } of urlsplit(url); throws UrlError where python raises ValueError */
function urlsplit(input) {
  let url = input.replace(/^[\x00-\x20]+/, '').replace(/[\t\r\n]/g, '');
  let scheme = '';
  let netloc = null;
  const i = url.indexOf(':');
  if (i > 0 && /^[A-Za-z]/.test(url) && /^[A-Za-z0-9+.-]*$/.test(url.slice(0, i))) {
    scheme = url.slice(0, i).toLowerCase();
    url = url.slice(i + 1);
  }
  if (url.startsWith('//')) {
    let delim = url.length;
    for (const c of '/?#') {
      const w = url.indexOf(c, 2);
      if (w >= 0) delim = Math.min(delim, w);
    }
    netloc = url.slice(2, delim);
    url = url.slice(delim);
    const lb = netloc.includes('[');
    const rb = netloc.includes(']');
    if (lb !== rb) fail('Invalid IPv6 URL');
    if (lb && rb) checkBracketedNetloc(netloc);
  }
  const h = url.indexOf('#');
  if (h >= 0) url = url.slice(0, h);
  const q = url.indexOf('?');
  if (q >= 0) url = url.slice(0, q);
  checkNetloc(netloc);
  return { scheme, netloc: netloc ?? '', path: url };
}

function hostAndPort(netloc) {
  const hostinfo = netloc.slice(netloc.lastIndexOf('@') + 1);
  const ob = hostinfo.indexOf('[');
  let hostname;
  let port;
  if (ob >= 0) {
    const bracketed = hostinfo.slice(ob + 1);
    const cb = bracketed.indexOf(']');
    hostname = cb < 0 ? bracketed : bracketed.slice(0, cb);
    const after = cb < 0 ? '' : bracketed.slice(cb + 1);
    const c = after.indexOf(':');
    port = c < 0 ? '' : after.slice(c + 1);
  } else {
    const c = hostinfo.indexOf(':');
    hostname = c < 0 ? hostinfo : hostinfo.slice(0, c);
    port = c < 0 ? '' : hostinfo.slice(c + 1);
  }
  if (hostname) {
    const pct = hostname.indexOf('%');
    hostname = pct < 0 ? hostname.toLowerCase() : hostname.slice(0, pct).toLowerCase() + hostname.slice(pct);
  } else hostname = null;
  let portNum = null;
  if (port) {
    if (!/^[0-9]+$/.test(port)) fail('Port could not be cast to integer value');
    portNum = Number(port);
    if (portNum > 65535) fail('Port out of range 0-65535');
  }
  return { hostname, port: portNum };
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
