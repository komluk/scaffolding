// Shared builders for the refactor-guard parity cases (sandbox files, transcripts, hook payloads).
export const WS = '@SANDBOX@/ws';
export const TR = '@SANDBOX@/t.jsonl';
const q = (s) => `'${s.replace(/'/g, "'\\''")}'`;

/** shell line: write exact bytes (no trailing newline added) to a sandbox path */
export const put = (file, content) => `mkdir -p "$(dirname ${q(file)})"; printf '%s' ${q(content)} > ${q(file)}`;
/** a transcript: objects become JSON lines, strings are written as they are */
export const jsonl = (file, ...lines) => put(file, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');

export const use = (name, input, id) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', ...(id === undefined ? {} : { id }), name, input }] } });
export const res = (id, content, isError) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, ...(isError === undefined ? {} : { is_error: isError }), content }] } });
export const lsp = (file, op = 'findReferences', id) => use('LSP', { operation: op, filePath: file, line: 1, character: 17 }, id);
export const graph = (tool, input, id) => use(`mcp__graphify__${tool}`, input, id);

/** the workspace of tests/hooks/test-refactor-guard.sh plus one definition per language */
export const BASE = [
  put('ws/src/a.ts', 'export function foo() {}\nexport const bar = 1;\n'),
  put('ws/src/m.py', 'def keep():\n    pass\n'),
  put('ws/src/out.ts', 'export function createPlatformOutcomes() {}\nfunction localThing() {}\n'),
  put('ws/src/use.ts', 'import { createPlatformOutcomes } from "./out";\ncreatePlatformOutcomes();\nconst localThing2 = 1;\n'),
  put('ws/node_modules/x/ignored.ts', 'export function createPlatformOutcomes() {}\n'),
  put('ws/NOTES.md', 'createPlatformOutcomes docs\n'),
  put('ws/src/lib.go', 'package lib\n\nfunc Serve() {}\nfunc (s *T) Method() {}\ntype Config struct{}\nconst Max = 1\nvar Dflt = 2\nfunc private() {}\n'),
  put('ws/src/lib.rs', 'pub fn run() {}\npub(crate) struct Inner;\npub async fn go() {}\nfn hidden() {}\n'),
  put('ws/src/Svc.cs', 'public class Svc {}\npublic static partial class Util {}\ninternal class Hidden {}\n'),
  put('ws/src/Svc.java', 'public class Svc {}\npublic interface Api {}\n'),
  put('ws/src/Svc.kt', 'public class Svc {}\npublic enum Mode {}\n'),
  put('ws/src/a.test.ts', 'export function foo() {}\n'),
  put('ws/tests/helper.ts', 'export function helperFn() {}\n'),
  put('ws/src/many.ts', 'export function alpha() {}\nexport function beta() {}\nexport class Gamma {}\nexport default async function delta() {}\n'),
  put('ws/src/u.ts', 'export function zażółć() {}\nexport const naïve = 1;\n'),
  put('ws/src/crlf.ts', 'export function crlfFn() {}\r\nexport const crlfConst = 1;\r\n'),
  put('ws/src/spaced.ts', '  export   const   spaced   =   1;\n\texport\ttype\tTabbed = string;\n'),
];

export const LSP_STUBS = (names) => names.map((n) => `printf '#!/bin/sh\\n' > @SANDBOX@/bin/${n}; chmod +x @SANDBOX@/bin/${n}`);

/**
 * One hook run. input = tool_input; tr = transcript file name inside the sandbox (null = field omitted);
 * mode = SCAFFOLDING_REFACTOR_GUARD (null = unset); lspMode = REFACTOR_GUARD_LSP (null = unset: plugin.json + PATH decide).
 */
export function run(name, { tool = 'Edit', input, tr = 't.jsonl', mode = 'deny', lspMode = 'on', cwd = WS, setup = [], env = {}, payload = {}, raw } = {}) {
  const stdin = raw ?? JSON.stringify({ ...(tool === null ? {} : { tool_name: tool }), ...(tr === null ? {} : { transcript_path: `@SANDBOX@/${tr}` }), ...(cwd === null ? {} : { cwd }), tool_input: input, ...payload });
  return {
    name,
    stdin,
    setup: [...BASE, ...setup],
    env: { SCAFFOLDING_REFACTOR_GUARD: mode, REFACTOR_GUARD_LSP: lspMode, ...env },
  };
}

export const bash = (command) => ({ command });
export const edit = (file, oldS, newS) => ({ file_path: file, old_string: oldS, new_string: newS });
