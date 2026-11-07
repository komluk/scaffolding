import { BAD_INPUTS, j, ti } from './_util.mjs';

const ON = { SCAFFOLDING_AUTOFORMAT: '1', SANDBOX: '@SANDBOX@' };
const stub = (name, dir = 'bin') => `mkdir -p ${dir}; printf '#!/bin/sh\\necho "${name}: $* [cwd=$(pwd)]" >> "$SANDBOX/calls"\\n' > ${dir}/${name}; chmod +x ${dir}/${name}`;
const after = ['cat calls 2>/dev/null; echo "[rc:$?]"'];
const c = (name, o) => ({ env: ON, after, ...o, name });
const f = (p) => j(ti({ file_path: p }));

export default [
  {
    hook: 'post-edit-format.sh',
    cases: [
      { name: 'gate off: no-op', stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('ruff')], after, env: { SANDBOX: '@SANDBOX@' } },
      { name: 'gate = 0: no-op', stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('ruff')], after, env: { SCAFFOLDING_AUTOFORMAT: '0', SANDBOX: '@SANDBOX@' } },
      { name: 'gate = true: no-op (needs exactly 1)', stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('ruff')], after, env: { SCAFFOLDING_AUTOFORMAT: 'true', SANDBOX: '@SANDBOX@' } },
      ...BAD_INPUTS.map(([name, x]) => c(`bad input: ${name}`, { ...x, setup: ['touch a.py', stub('ruff')] })),
      c('missing file', { stdin: f('@SANDBOX@/nope.py'), setup: [stub('ruff')] }),
      c('empty path', { stdin: f(''), setup: [stub('ruff')] }),
      c('py -> ruff format', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('ruff')] }),
      c('py -> black when no ruff', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('black')] }),
      c('py -> ruff preferred over black', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('ruff'), stub('black')] }),
      c('py -> venv ruff first', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('ruff'), stub('ruff', 'venv/bin')] }),
      c('py -> .venv black', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('black', '.venv/bin')] }),
      c('py -> app/backend/venv ruff', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('ruff', 'app/backend/venv/bin')] }),
      c('py -> no formatter: silent', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py'] }),
      c('ts -> npx prettier', { stdin: f('@SANDBOX@/a.ts'), setup: ['touch a.ts', stub('npx')] }),
      c('tsx -> npx prettier', { stdin: f('@SANDBOX@/a.tsx'), setup: ['touch a.tsx', stub('npx')] }),
      c('js/jsx/json/css/scss -> prettier', { stdin: f('@SANDBOX@/a.scss'), setup: ['touch a.scss', stub('npx')] }),
      c('json -> prettier', { stdin: f('@SANDBOX@/a.json'), setup: ['touch a.json', stub('npx')] }),
      c('local node_modules prettier first', { stdin: f('@SANDBOX@/a.ts'), setup: ['touch a.ts', stub('npx'), stub('prettier', 'node_modules/.bin')] }),
      c('ts -> no prettier: silent', { stdin: f('@SANDBOX@/a.ts'), setup: ['touch a.ts'] }),
      c('cs -> dotnet format', { stdin: f('@SANDBOX@/a.cs'), setup: ['touch a.cs', stub('dotnet')] }),
      c('cs -> no dotnet: silent', { stdin: f('@SANDBOX@/a.cs'), setup: ['touch a.cs'] }),
      c('md -> no formatter', { stdin: f('@SANDBOX@/a.md'), setup: ['touch a.md', stub('ruff'), stub('npx')] }),
      c('no extension: whole name is the ext', { stdin: f('@SANDBOX@/py'), setup: ['touch py', stub('ruff')] }),
      c('uppercase ext not matched', { stdin: f('@SANDBOX@/A.PY'), setup: ['touch A.PY', stub('ruff')] }),
      c('path with spaces', { stdin: f('@SANDBOX@/my dir/a b.py'), setup: ["mkdir 'my dir'; touch 'my dir/a b.py'", stub('ruff')] }),
      c('unicode path', { stdin: f('@SANDBOX@/zażółć.py'), setup: ['touch zażółć.py', stub('ruff')] }),
      c('relative path', { stdin: f('a.py'), setup: ['touch a.py', stub('ruff')] }),
      c('top-level file_path fallback', { stdin: j({ file_path: '@SANDBOX@/a.py' }), setup: ['touch a.py', stub('ruff')] }),
      c('tool_input without file_path: no fallback', { stdin: j({ file_path: '@SANDBOX@/a.py', tool_input: {} }), setup: ['touch a.py', stub('ruff')] }),
      c('file_path is a number', { stdin: j(ti({ file_path: 7 })), setup: ['touch 7', stub('ruff')] }),
      c('file_path is null', { stdin: j(ti({ file_path: null })), setup: [stub('ruff')] }),
      c('dir named like a file', { stdin: f('@SANDBOX@/d.py'), setup: ['mkdir d.py', stub('ruff')] }),
      c('formatter failing is swallowed', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('ruff'), "printf '#!/bin/sh\\nexit 3\\n' > bin/ruff"], }),
      c('formatter failing falls through to black', { stdin: f('@SANDBOX@/a.py'), setup: ['touch a.py', stub('black'), "printf '#!/bin/sh\\necho ruff-failed >> \"$SANDBOX/calls\"; exit 3\\n' > bin/ruff; chmod +x bin/ruff"] }),
      c('invalid utf-8 in unrelated field', { stdin_b64: Buffer.from('{"x":"\xff","tool_input":{"file_path":"@SANDBOX@/a.py"}}', 'latin1').toString('base64'), setup: ['touch a.py', stub('ruff')] }),
    ],
  },
];
