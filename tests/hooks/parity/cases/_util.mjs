// Shared helpers for the parity case files.
export const j = (o) => JSON.stringify(o);
export const ti = (o) => ({ tool_input: o });
const b64 = (s) => Buffer.from(s, 'latin1').toString('base64');
export const raw = (s) => ({ stdin_b64: b64(s) }); // arbitrary bytes (latin1 string -> bytes)
export const utf8 = (s) => ({ stdin_b64: Buffer.from(s, 'utf8').toString('base64') });

// Inputs every stdin-JSON hook must survive: [name, case-fragment]
export const BAD_INPUTS = [
  ['empty stdin', { stdin: '' }],
  ['whitespace only', { stdin: ' \n' }],
  ['malformed json', { stdin: '{not json' }],
  ['truncated json', { stdin: '{"tool_input":{"command":"rm -rf /"' }],
  ['top-level array', { stdin: '[1,2]' }],
  ['top-level string', { stdin: '"rm -rf /"' }],
  ['top-level null', { stdin: 'null' }],
  ['tool_input null', { stdin: '{"tool_input":null}' }],
  ['tool_input string', { stdin: '{"tool_input":"rm -rf /"}' }],
  ['tool_input array', { stdin: '{"tool_input":[1]}' }],
  ['utf-8 BOM', { stdin_b64: Buffer.from('﻿{"tool_input":{"command":"x"}}', 'utf8').toString('base64') }],
  ['invalid utf-8 bytes', raw('{"tool_input":{"command":"a\xffb"}}')],
];
