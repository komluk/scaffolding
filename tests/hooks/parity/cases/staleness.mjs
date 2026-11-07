import { BAD_INPUTS, j, ti } from './_util.mjs';

const E = { SCAFFOLDING_TASK_ID: '@TASK@' };
const STORE = '/tmp/scaffolding-mtime-$TASK.json';
const after = [`cat ${STORE} 2>/dev/null; echo "[rc-store:$?]"`];
const FILE = '@SANDBOX@/f.txt';
const mk = (mtime = 1700000000, name = 'f.txt') => `printf x > '${name}'; touch -d @${mtime} '${name}'`;
const seed = (json) => `printf '%s' '${json}' > ${STORE}`;

function suite() {
  const c = (name, o) => ({ env: E, after, ...o, name });
  return [
    ...BAD_INPUTS.map(([name, f]) => c(`bad input: ${name}`, { ...f, setup: [mk()] })),
    { name: 'no task id: no-op even for stale file', stdin: j(ti({ file_path: FILE })), setup: [mk()], after, env: { SCAFFOLDING_TASK_ID: null } },
    { name: 'empty task id: no-op', stdin: j(ti({ file_path: FILE })), setup: [mk()], after, env: { SCAFFOLDING_TASK_ID: '' } },
    c('missing file (new file) ignored', { stdin: j(ti({ file_path: '@SANDBOX@/new.txt' })) }),
    c('directory ignored', { stdin: j(ti({ file_path: '@SANDBOX@' })) }),
    c('empty file_path', { stdin: j(ti({ file_path: '' })), setup: [mk()] }),
    c('file_path missing', { stdin: j(ti({})), setup: [mk()] }),
    c('first access records mtime', { stdin: j(ti({ file_path: FILE })), setup: [mk()] }),
    c('first access, store has other entries', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"/other": "5"}')] }),
    c('unchanged mtime', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"@SANDBOX@/f.txt": "1700000000"}')] }),
    c('changed mtime', { stdin: j(ti({ file_path: FILE })), setup: [mk(1700000050), seed('{"@SANDBOX@/f.txt": "1700000000"}')] }),
    c('changed mtime, other entries kept', { stdin: j(ti({ file_path: FILE })), setup: [mk(1700000050), seed('{"a": "1", "@SANDBOX@/f.txt": "1700000000", "z": [1, 2.50, null]}')] }),
    c('stored value is a number', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"@SANDBOX@/f.txt": 1700000000}')] }),
    c('stored value is a float', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"@SANDBOX@/f.txt": 1700000000.0}')] }),
    c('stored value is null: first access', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"@SANDBOX@/f.txt": null}')] }),
    c('stored value is a list', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"@SANDBOX@/f.txt": ["1700000000"]}')] }),
    c('stored value is an object', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"@SANDBOX@/f.txt": {"a": true}}')] }),
    c('stored value is true', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"@SANDBOX@/f.txt": true}')] }),
    c('stored value is empty string', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"@SANDBOX@/f.txt": ""}')] }),
    c('corrupt store is reset', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{not json')] }),
    c('empty store file is reset', { stdin: j(ti({ file_path: FILE })), setup: [mk(), `: > ${STORE}`] }),
    c('store with unicode and escapes kept', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"ąę\\u00e9": "1", "q\\"x": "\\\\", "e": 1e3, "big": 123456789012345678901234567890, "t": true}')] }),
    c('pre-existing store key order kept on update', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"b": "2", "a": "1"}')] }),
    c('duplicate keys in store', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"a": "1", "b": "2", "a": "3"}')] }),
    c('store with NaN and Infinity', { stdin: j(ti({ file_path: FILE })), setup: [mk(), seed('{"n": NaN, "i": -Infinity}')] }),
    c('fallback to top-level file_path', { stdin: j({ file_path: FILE }), setup: [mk()] }),
    c('tool_input present but without file_path: no fallback', { stdin: j({ file_path: FILE, tool_input: { x: 1 } }), setup: [mk()] }),
    c('relative file_path', { stdin: j(ti({ file_path: 'f.txt' })), setup: [mk()] }),
    c('path with spaces', { stdin: j(ti({ file_path: '@SANDBOX@/a b/f x.txt' })), setup: ["mkdir 'a b'", mk(1700000001, 'a b/f x.txt')] }),
    c('unicode path escaped in store', { stdin: j(ti({ file_path: '@SANDBOX@/zażółć.txt' })), setup: [mk(1700000002, 'zażółć.txt')] }),
    c('astral unicode path', { stdin: j(ti({ file_path: '@SANDBOX@/😀.txt' })), setup: [mk(1700000003, '😀.txt')] }),
    c('file_path with trailing newline is trimmed', { stdin: j(ti({ file_path: `${FILE}\n` })), setup: [mk()] }),
    c('file_path with trailing spaces is not a file', { stdin: j(ti({ file_path: `${FILE}  ` })), setup: [mk()] }),
    c('file_path is a number', { stdin: j(ti({ file_path: 5 })), setup: [mk()] }),
    c('file_path number naming an existing file', { stdin: j(ti({ file_path: 5 })), setup: [mk(1700000004, '5')] }),
    c('file_path is a list', { stdin: j(ti({ file_path: [FILE] })), setup: [mk()] }),
    c('file_path is null', { stdin: j(ti({ file_path: null })), setup: [mk()] }),
    c('file_path is true', { stdin: j(ti({ file_path: true })), setup: [mk()] }),
    c('file_path float naming an existing file', { stdin: j(ti({ file_path: 1.5 })), setup: [mk(1700000004, '1.5')] }),
    c('file_path is None-like string "None"', { stdin: j(ti({ file_path: null })), setup: [mk(1700000004, 'None')] }),
    c('lone surrogate escape in file_path', { stdin: '{"tool_input":{"file_path":"@SANDBOX@/f.txt\\ud800"}}', setup: [mk()] }),
    c('tool_input null', { stdin: '{"tool_input":null,"file_path":"x"}', setup: [mk()] }),
    c('symlink to file is a file', { stdin: j(ti({ file_path: '@SANDBOX@/ln.txt' })), setup: [mk(), 'ln -s f.txt ln.txt; touch -h -d @1700000009 ln.txt'] }),
    c('dangling symlink is not a file', { stdin: j(ti({ file_path: '@SANDBOX@/ln.txt' })), setup: ['ln -s missing.txt ln.txt'] }),
    c('mtime before 1970', { stdin: j(ti({ file_path: FILE })), setup: [mk(-5)] }),
    c('mtime zero', { stdin: j(ti({ file_path: FILE })), setup: [mk(0)] }),
    c('mtime far future', { stdin: j(ti({ file_path: FILE })), setup: [mk(4102444800)] }),
    c('sub-second mtime is floored', { stdin: j(ti({ file_path: FILE })), setup: ["printf x > f.txt; touch -d '@1700000000.5' f.txt"] }),
    c('extra payload fields ignored', { stdin: j({ tool_name: 'Edit', session_id: 's', tool_input: { file_path: FILE, old_string: 'a', new_string: 'b' } }), setup: [mk()] }),
    c('escaped slash in path', { stdin: `{"tool_input":{"file_path":"@SANDBOX@\\/f.txt"}}`, setup: [mk()] }),
    c('CRLF around json', { stdin: `\r\n${j(ti({ file_path: FILE }))}\r\n`, setup: [mk()] }),
    c('invalid utf-8 inside unrelated field', { stdin_b64: Buffer.from(`{"x":"\xff","tool_input":{"file_path":"${'@SANDBOX@'}/f.txt"}}`, 'latin1').toString('base64'), setup: [mk()] }),
  ];
}

export default [
  { hook: 'file-staleness-check.sh', cases: suite() },
  { hook: 'file-staleness-update.sh', cases: suite() },
];
