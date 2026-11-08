// ipclass.mjs — python 3.14 `ipaddress` is_loopback / is_private for the addresses getaddrinfo hands back
// (plain ESM, Node >= 22, node: built-ins only).
//
// The tables are copied from CPython 3.14 (Lib/ipaddress.py, _IPv4Constants / _IPv6Constants), NOT derived from
// RFC 1918 alone: python's `is_private` means "listed in the IANA special-purpose registry as not globally reachable"
// (so 192.0.2.0/24, 198.18.0.0/15, 240.0.0.0/4 ... count), minus the registry exceptions, and 100.64.0.0/10
// (CGNAT / Tailscale) is deliberately NOT private. An IPv4-mapped IPv6 address is classified as its IPv4 address.
// tests/hooks/parity/cases/memory-recall.mjs checks `classify` against python-recorded answers for the edges of every
// network below, so a drifting table fails the suite.

const V4_PRIVATE = ['0.0.0.0/8', '10.0.0.0/8', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.0.170/31', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '240.0.0.0/4', '255.255.255.255/32'];
const V4_EXCEPT = ['192.0.0.9/32', '192.0.0.10/32'];
const V6_PRIVATE = ['::1/128', '::/128', '::ffff:0.0.0.0/96', '64:ff9b:1::/48', '100::/64', '2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20', 'fc00::/7', 'fe80::/10'];
const V6_EXCEPT = ['2001:1::1/128', '2001:1::2/128', '2001:3::/32', '2001:4:112::/48', '2001:20::/28', '2001:30::/28'];

const cidr = (s, v6) => {
  const [a, bits] = s.split('/');
  const total = v6 ? 128n : 32n;
  const shift = total - BigInt(bits);
  const addr = v6 ? parseV6(a) : parseV4(a);
  return [addr >> shift, shift];
};

/** dotted quad -> BigInt, or null (python: ValueError). No leading zeros, like ipaddress since 3.9.5. */
export function parseV4(s) {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const p of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(p) || Number(p) > 255) return null;
    n = (n << 8n) | BigInt(p);
  }
  return n;
}

/** IPv6 text (zero compression, trailing dotted quad) -> BigInt, or null */
export function parseV6(s) {
  if (!s.includes(':')) return null;
  const dbl = s.indexOf('::');
  if (dbl !== s.lastIndexOf('::')) return null;
  const groups = (part) => {
    if (part === '') return [];
    const out = [];
    const items = part.split(':');
    for (const [i, g] of items.entries()) {
      if (i === items.length - 1 && g.includes('.')) {
        const v4 = parseV4(g);
        if (v4 === null) return null;
        out.push(Number(v4 >> 16n), Number(v4 & 0xffffn));
      } else if (/^[0-9a-fA-F]{1,4}$/.test(g)) out.push(parseInt(g, 16));
      else return null;
    }
    return out;
  };
  let all;
  if (dbl >= 0) {
    const head = groups(s.slice(0, dbl));
    const tail = groups(s.slice(dbl + 2));
    if (head === null || tail === null || head.length + tail.length > 7) return null;
    all = [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail];
  } else {
    all = groups(s);
    if (all === null || all.length !== 8) return null;
  }
  return all.reduce((n, g) => (n << 16n) | BigInt(g), 0n);
}

const V4 = { priv: V4_PRIVATE.map((c) => cidr(c, false)), exc: V4_EXCEPT.map((c) => cidr(c, false)), bits: 32n };
const V6 = { priv: V6_PRIVATE.map((c) => cidr(c, true)), exc: V6_EXCEPT.map((c) => cidr(c, true)), bits: 128n };
const inNet = (addr, [net, shift]) => addr >> shift === net;

function classify4(a) {
  return [a >> 24n === 127n, V4.priv.some((n) => inNet(a, n)) && !V4.exc.some((n) => inNet(a, n))];
}

/**
 * [is_loopback, is_private] of an IP literal as python's ipaddress.ip_address() answers it;
 * null when python would raise ValueError (not an IP address).
 */
export function classify(text) {
  const v4 = parseV4(text);
  if (v4 !== null) return classify4(v4);
  const a = parseV6(text);
  if (a === null) return null;
  if (a >> 32n === 0xffffn) return classify4(a & 0xffffffffn); // ::ffff:0:0/96 -> the mapped IPv4 address
  return [a === 1n, V6.priv.some((n) => inNet(a, n)) && !V6.exc.some((n) => inNet(a, n))];
}

/** the hook's test: python `is_loopback or is_private`; an unparsable address is not private */
export const isLocal = (text) => {
  const c = classify(text.split('%')[0]);
  return c !== null && (c[0] || c[1]);
};
