// pyurl.mjs — urllib.parse.urlsplit (CPython 3.14) as far as the hooks read it (plain ESM, Node >= 22, node: built-ins only).
// Faithful port, quirks included: the same URL must be accepted, rejected and split the same way, because the hooks
// decide (action-log target, memory-recall host check) from what python's urlsplit() said. Raises UrlError where python
// raises ValueError.

export class UrlError extends Error {}
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

/** { scheme, netloc, path, query (null when there is no '?') } of urlsplit(url); throws UrlError where python raises ValueError */
export function urlsplit(input) {
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
  let query = null;
  if (q >= 0) {
    query = url.slice(q + 1);
    url = url.slice(0, q);
  }
  checkNetloc(netloc);
  return { scheme, netloc: netloc ?? '', path: url, query };
}

export function hostAndPort(netloc) {
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


/** SplitResult._hostinfo: [hostname, port] as the raw strings python slices out of the netloc ('' -> null for the port) */
function hostinfo(netloc) {
  const info = netloc.slice(netloc.lastIndexOf('@') + 1);
  const ob = info.indexOf('[');
  let host;
  let port;
  if (ob >= 0) {
    const bracketed = info.slice(ob + 1);
    const cb = bracketed.indexOf(']');
    host = cb < 0 ? bracketed : bracketed.slice(0, cb);
    const after = cb < 0 ? '' : bracketed.slice(cb + 1);
    const c = after.indexOf(':');
    port = c < 0 ? '' : after.slice(c + 1);
  } else {
    const c = info.indexOf(':');
    host = c < 0 ? info : info.slice(0, c);
    port = c < 0 ? '' : info.slice(c + 1);
  }
  return [host, port || null];
}

/** SplitResult.hostname: lower-cased, zone id kept as written; null when empty. Never raises. */
export function hostnameOf(netloc) {
  const host = hostinfo(netloc)[0];
  if (!host) return null;
  const pct = host.indexOf('%');
  return pct < 0 ? host.toLowerCase() : host.slice(0, pct).toLowerCase() + host.slice(pct);
}

/** SplitResult.port: an int, null when absent; throws UrlError like python's ValueError */
export function portOf(netloc) {
  const port = hostinfo(netloc)[1];
  if (port === null) return null;
  if (!/^[0-9]+$/.test(port)) fail('Port could not be cast to integer value');
  const n = Number(port);
  if (n > 65535) fail('Port out of range 0-65535');
  return n;
}
