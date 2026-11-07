// \r / \r\n handling of `quote` and `emit-block` (python sys.stdin.read() on a pipe does NOT translate newlines),
// run through helpers/ so the golden comes from the python one-liners of v2.34.0.
import { raw, utf8 } from './_util.mjs';

const texts = [
  ['lone CR in the middle', 'a\rb'],
  ['CRLF in the middle', 'a\r\nb'],
  ['mixed CR, CRLF, LF', 'a\rb\r\nc\nd'],
  ['trailing CR', 'x\r'],
  ['trailing CRLF', 'x\r\n'],
  ['leading CR', '\rx'],
  ['only CR', '\r'],
  ['only CRLF', '\r\n'],
  ['double CR then LF (\\r\\r\\n)', 'a\r\r\nb'],
  ['LF then CR (\\n\\r)', 'a\n\rb'],
  ['many CRs', '\r\r\r'],
  ['CR next to quote and backslash', 'a\r"b"\\\r\n'],
  ['CR next to unicode', 'zażółć\r😀\r\nę'],
  ['plain LF still untouched', 'a\nb\n'],
  ['empty', ''],
];

const sets = (prefix) => [
  ...texts.map(([name, t]) => ({ name: `${prefix}${name}`, ...raw(t) })),
  { name: `${prefix}utf-8 text with CRLF`, ...utf8('zażółć\r\ngęślą') },
  { name: `${prefix}invalid utf-8 byte (C.UTF-8 surrogateescape)`, ...raw('a\xffb\r\n') },
  { name: `${prefix}invalid utf-8 lone continuation + CR`, ...raw('\x80\r') },
  { name: `${prefix}BOM kept`, ...raw('\xef\xbb\xbfa\r') },
];

const guard = (name, payload, text) => ({ name, env: { GUARD_JSON: payload }, ...raw(text) });

export default [
  { hook: 'quote.sh', helper: true, cases: sets('') },
  { hook: 'emit-block.sh', helper: true, cases: sets('') },
  {
    hook: 'emit-block-guard.sh',
    helper: true,
    cases: [
      guard('inactive: reason with CR/CRLF', '{"stop_hook_active":false}', 'a\rb\r\nc\r'),
      guard('inactive: reason with only CR', '{}', '\r'),
      guard('inactive: reason CRLF at end', '{}', 'line1\r\nline2\r\n'),
      guard('inactive: bad json payload', '{oops', 'a\r\nb'),
      guard('inactive: empty payload', '', 'a\rb'),
      guard('active: silent whatever the reason', '{"stop_hook_active":true}', 'a\rb'),
      guard('inactive: CR in the payload JSON string is invalid json -> inactive', '{"stop_hook_active":true,"x":"a\rb"}', 'r\r'),
      guard('active: CRLF as json whitespace', '{\r\n"stop_hook_active":true\r\n}', 'r\r'),
      guard('inactive: reason with invalid utf-8 + CR', '{}', 'a\xff\r'),
      guard('inactive: reason with NUL-free multi-line CR block', '{}', 'Completion check:\r\n  - one\r\n  - two\r  - three\n'),
    ],
  },
];
