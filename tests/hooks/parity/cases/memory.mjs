import { BAD_INPUTS, j } from './_util.mjs';

const PROJ = '@SANDBOX@/proj';
const E = (extra = {}) => ({ CLAUDE_PROJECT_DIR: PROJ, ...extra });
const state = ['cd proj 2>/dev/null || exit 0', 'for f in .scaffolding/.ingest-dirty .scaffolding/.ingest-queue .scaffolding/.ingest-seen; do [ -e $f ] && { echo "== $f"; cat $f; }; done; true'];
const DIRTY = ['mkdir -p proj/.scaffolding/conversations', 'touch proj/.scaffolding/.ingest-dirty'];
const withPid = [...DIRTY, "echo 'scaffold:abc123' > proj/.scaffolding/project-id"];
const raw = (s) => Buffer.from(s, 'latin1').toString('base64');

const ingest = (name, stdin, env, setup = DIRTY, extra = {}) => ({ name, stdin, env: E(env), setup, after: state, ...extra });
const stopActive = j({ stop_hook_active: true });
const stopIdle = j({ stop_hook_active: false });

const mark = (name, stdin, setup, env = {}, extra = {}) => ({ name, stdin, env: E(env), setup, after: state, ...extra });
const MARKABLE = ['mkdir -p proj/.scaffolding/conversations/u1/agent-memory'];

export default [
  {
    hook: 'memory-ingest.sh',
    cases: [
      ...BAD_INPUTS.map(([name, f]) => ingest(`bad input: ${name} (advisory)`, '', {}, DIRTY, f)),
      ...BAD_INPUTS.map(([name, f]) => ingest(`bad input: ${name} (block)`, '', { SCAFFOLDING_MEMORY_INGEST: 'block' }, DIRTY, f)),
      ingest('advisory prints directive to stderr (project-id unresolved)', stopIdle, {}),
      ingest('advisory with project id', stopIdle, {}, withPid),
      ingest('block mode emits JSON decision (no project id)', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'block' }),
      ingest('block mode with project id', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
      ingest('block mode, stop_hook_active true: silent', stopActive, { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
      ingest('advisory, stop_hook_active true: silent', stopActive, {}, withPid),
      ingest('off: no-op', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'off' }, withPid),
      ingest('not dirty: no-op', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'block' }, ['mkdir -p proj/.scaffolding']),
      ingest('.noingest sentinel: no-op', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'block' }, [...withPid, 'touch proj/.scaffolding/.noingest']),
      ingest('unknown mode value is advisory', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'whatever' }, withPid),
      ingest('project-id file with trailing spaces/lines', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'block' }, [...DIRTY, "printf 'scaffold:x1\\n\\n' > proj/.scaffolding/project-id"]),
      ingest('project-id with quotes and unicode', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'block' }, [...DIRTY, "printf 'sc\"af\\\\fold:zażółć 😀' > proj/.scaffolding/project-id"]),
      ingest('project dir with spaces and unicode', stopIdle, { SCAFFOLDING_MEMORY_INGEST: 'block', CLAUDE_PROJECT_DIR: '@SANDBOX@/pro j/ąę' }, ['mkdir -p "pro j/ąę/.scaffolding"', 'touch "pro j/ąę/.scaffolding/.ingest-dirty"'], { after: ['true'] }),
      ingest('CLAUDE_PROJECT_DIR unset falls back to PWD', stopIdle, { CLAUDE_PROJECT_DIR: null, SCAFFOLDING_MEMORY_INGEST: 'block' }, ['mkdir -p .scaffolding', 'touch .scaffolding/.ingest-dirty'], { after: ['true'] }),
      ingest('stop_hook_active string', j({ stop_hook_active: 'no' }), { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
      ingest('stop_hook_active 0', j({ stop_hook_active: 0 }), { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
      ingest('stop_hook_active []', j({ stop_hook_active: [] }), { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
      ingest('stop_hook_active 2', j({ stop_hook_active: 2 }), { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
      ingest('stop_hook_active 1.5', '{"stop_hook_active":1.5}', { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
      ingest('stop_hook_active null', j({ stop_hook_active: null }), { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
      ingest('stop_hook_active {}', j({ stop_hook_active: {} }), { SCAFFOLDING_MEMORY_INGEST: 'block' }, withPid),
    ],
  },
  {
    hook: 'memory-ingest-mark.sh',
    cases: [
      ...BAD_INPUTS.map(([name, f]) => mark(`bad input: ${name}`, '', MARKABLE, {}, f)),
      mark('marks dirty, topic from subagent_type', j({ subagent_type: 'developer' }), MARKABLE),
      mark('topic defaults to task when missing', j({}), MARKABLE),
      mark('topic default when subagent_type is empty', j({ subagent_type: '' }), MARKABLE),
      mark('topic default when subagent_type null', j({ subagent_type: null }), MARKABLE),
      mark('topic default when subagent_type 0', j({ subagent_type: 0 }), MARKABLE),
      mark('topic default when subagent_type false', j({ subagent_type: false }), MARKABLE),
      mark('topic is number', j({ subagent_type: 42 }), MARKABLE),
      mark('topic is float', '{"subagent_type":1.0}', MARKABLE),
      mark('topic is true', j({ subagent_type: true }), MARKABLE),
      mark('topic is list', j({ subagent_type: ['a', 1, null] }), MARKABLE),
      mark('topic is object', j({ subagent_type: { a: 'b' } }), MARKABLE),
      mark('topic is empty list -> task', j({ subagent_type: [] }), MARKABLE),
      mark('topic with quotes (json-unsafe in the printf line)', j({ subagent_type: 'a"b' }), MARKABLE),
      mark('topic with backslash', j({ subagent_type: 'a\\nb' }), MARKABLE),
      mark('topic with real newline', j({ subagent_type: 'a\nb' }), MARKABLE),
      mark('topic with trailing newline', j({ subagent_type: 'dev\n' }), MARKABLE),
      mark('topic with percent signs', j({ subagent_type: '100%s%d' }), MARKABLE),
      mark('topic unicode', j({ subagent_type: 'zażółć 😀' }), MARKABLE),
      mark('topic scaffolding:developer', j({ subagent_type: 'scaffolding:developer' }), MARKABLE),
      mark('top-level array -> task', '["x"]', MARKABLE),
      mark('top-level string -> task', '"x"', MARKABLE),
      mark('invalid utf-8 anywhere -> task', '', MARKABLE, {}, { stdin_b64: raw('{"x":"\xff","subagent_type":"dev"}') }),
      mark('off: no-op', j({ subagent_type: 'developer' }), MARKABLE, { SCAFFOLDING_MEMORY_INGEST: 'off' }),
      mark('.noingest: no-op', j({ subagent_type: 'developer' }), [...MARKABLE, 'touch proj/.scaffolding/.noingest']),
      mark('no conversations dir: no-op', j({ subagent_type: 'developer' }), ['mkdir -p proj/.scaffolding']),
      mark('already dirty: no-op', j({ subagent_type: 'developer' }), [...MARKABLE, 'touch proj/.scaffolding/.ingest-dirty']),
      mark('seen newer than context.md: stays clean', j({ subagent_type: 'developer' }), [...MARKABLE, 'echo n > proj/.scaffolding/conversations/u1/agent-memory/context.md', 'touch -d @1700000000 proj/.scaffolding/conversations/u1/agent-memory/context.md', 'touch -d @1700000100 proj/.scaffolding/.ingest-seen']),
      mark('context.md newer than seen: marks', j({ subagent_type: 'developer' }), [...MARKABLE, 'echo n > proj/.scaffolding/conversations/u1/agent-memory/context.md', 'touch -d @1700000100 proj/.scaffolding/conversations/u1/agent-memory/context.md', 'touch -d @1700000000 proj/.scaffolding/.ingest-seen']),
      mark('appends a second breadcrumb line when queue exists', j({ subagent_type: 'reviewer' }), [...MARKABLE, "echo 'old' > proj/.scaffolding/.ingest-queue"]),
      mark('large stdin', j({ subagent_type: 'big', pad: 'x'.repeat(200000) }), MARKABLE),
    ],
  },
];
