// Golden cases for the episodic action log: the CLI (platform / local / render / backfill / usage) through
// helpers/action-log-cli.sh and the Stop/SessionEnd shim hooks/action-log.sh. Goldens were recorded from the
// python implementation (v2.37.0, hooks/lib/action_log.py). Inputs are built here, deterministically (no clock, no random).
// Dates are kept verbatim (keepDates): they are rendered into records and timeline.md and are what is compared.
import { SECRETS, SID, calls, localRows, platformRows, tr, tu } from '../../action-log-fixtures.mjs';

const CONV = '22222222-3333-4444-5555-666666666666';
const J = (o) => JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
const lines = (rows) => rows.map((r) => (typeof r === 'string' ? r : J(r))).join('\n') + '\n';
const BASE = `share/projects/proj/conversations/${CONV}`;
const ROOT = `@SANDBOX@/${BASE}`;
// Every file under the sandbox with its mode; files over 16 KB are summarised (size, lines, sha256, first / last 2 lines)
// so the goldens stay small while a single differing byte still shows.
const STATE = [
  'cd "$SANDBOX"',
  `find . -path ./home -prune -o -path ./bin -prune -o -type f ! -name '.lock' ! -name '*.in' ! -name 'more.jsonl' ! -name 'rest.jsonl' -print | sort | while IFS= read -r f; do`,
  '  printf "== %s mode=%s\\n" "$f" "$(stat -c %a "$f")"',
  '  case "$f" in *.gz) src="zcat $f";; *) src="cat $f";; esac',
  '  if [ "$($src 2>/dev/null | wc -c)" -gt 16384 ]; then',
  '    printf "big: bytes=%s lines=%s sha256=%s\\n" "$($src 2>&1 | wc -c)" "$($src 2>&1 | wc -l)" "$($src 2>&1 | sha256sum | cut -d" " -f1)"',
  '    $src 2>&1 | head -2 | cut -c1-300; echo ...; $src 2>&1 | tail -2 | cut -c1-300',
  '  else $src 2>&1; fi',
  '  echo',
  'done',
];
const al = (...args) => args.join('\n');
const cli = (name, files, argv, extra = {}) => ({ name, files, env: { AL_ARGS: argv }, after: STATE, keepDates: true, ...extra });

const plat = (rows, tail = '') => `{not json\n${lines(rows)}${tail}`;
const raw = (v) => typeof v === 'string' || Buffer.isBuffer(v);
const taskFile = (rows, run = 'run-aaaa', conv = CONV, tail = '') => ({ [`share/projects/proj/conversations/${conv}/tasks/${run}/output.jsonl`]: raw(rows) ? rows : plat(rows, tail) });
const P = (run = 'run-aaaa', conv = CONV) => ['platform', '--task-dir', `@SANDBOX@/share/projects/proj/conversations/${conv}/tasks/${run}`, '--conv-dir', `@SANDBOX@/share/projects/proj/conversations/${conv}`];
const R = (conv = CONV) => ['render', '--conv-dir', `@SANDBOX@/share/projects/proj/conversations/${conv}`];

const frame = (tool, input, id, ts = 1792489380.0, parent) => ({ type: 'step', data: { type: 'tool_call', data: { tool, input, id, ...(parent ? { parent_tool_use_id: parent } : {}) } }, ts });
const result = (id, success, ts = 1792489381.0) => ({ type: 'step', data: { type: 'tool_result', data: { success, content: 'ignored', tool_use_id: id } }, ts });
const done = (status) => ({ type: 'done', data: { status }, ts: 1792489390.0 });

// ---------------------------------------------------------------- platform
const platform = [
  cli('fixtures: platform run + render', taskFile(platformRows()), al(...P(), ';;', ...R())),
  cli('fixtures: platform without tool_result frames', taskFile(platformRows(false)), al(...P(), ';;', ...R())),
  cli('platform: --force rewrites an existing log', { ...taskFile(platformRows()), [`${BASE}/actions/run-aaaa.jsonl`]: '{"old":1}\n' }, al(...P(), '--force')),
  cli('platform: existing log without --force is kept', { ...taskFile(platformRows()), [`${BASE}/actions/run-aaaa.jsonl`]: '{"old":1}\n' }, al(...P())),
  cli('platform: --agent sets the default agent', taskFile(platformRows()), al(...P(), '--agent', 'scaffolding:builder')),
  cli('platform: invalid --agent falls back to main', taskFile(platformRows()), al(...P(), '--agent', 'bad agent!')),
  cli('platform: option abbreviation --task / --conv / --for', taskFile(platformRows()), al('platform', '--task', `@SANDBOX@/${BASE}/tasks/run-aaaa`, '--conv=' + ROOT, '--for')),
  cli('platform: --opt=value forms', taskFile(platformRows()), al('platform', `--task-dir=${ROOT}/tasks/run-aaaa`, `--conv-dir=${ROOT}`)),
  cli('platform: task dir with trailing slash', taskFile(platformRows()), al('platform', '--task-dir', `${ROOT}/tasks/run-aaaa/`, '--conv-dir', ROOT + '/')),
  cli('platform: task dir name is not an identifier', taskFile(platformRows(), 'run aaaa'), al(...P('run aaaa'))),
  cli('platform: conversation name is not an identifier', taskFile(platformRows(), 'r1', 'conv bad'), al(...P('r1', 'conv bad'))),
  cli('platform: missing output.jsonl', { 'x/keep': '' }, al(...P())),
  cli('platform: output.jsonl is a directory', { [`${BASE}/tasks/run-aaaa/output.jsonl/x`]: '' }, al(...P())),
  cli('platform: relative paths', { 'tasks/r1/output.jsonl': plat(platformRows()) }, al('platform', '--task-dir', 'tasks/r1', '--conv-dir', 'share/projects/p/conversations/c1')),
  cli('platform: .scaffolding layout derives repo + project dir', { 'myrepo/.scaffolding/conversations/c-1/tasks/r-1/output.jsonl': plat([frame('Edit', { file_path: '@SANDBOX@/myrepo/src/a.ts' }, 'e1'), frame('Read', { file_path: '@SANDBOX@/home/notes.md' }, 'e2')]) }, al('platform', '--task-dir', '@SANDBOX@/myrepo/.scaffolding/conversations/c-1/tasks/r-1', '--conv-dir', '@SANDBOX@/myrepo/.scaffolding/conversations/c-1')),
  cli('platform: conv dir outside any conversations/ layout', { 'tasks/r1/output.jsonl': plat([frame('Bash', { command: 'ls' }, 'b1')]) }, al('platform', '--task-dir', '@SANDBOX@/tasks/r1', '--conv-dir', '@SANDBOX@/loose')),
  cli('platform: done statuses (completed)', taskFile([frame('Bash', { command: 'ls' }, 'b1'), done('completed')]), al(...P())),
  cli('platform: done statuses (cancelled)', taskFile([frame('Bash', { command: 'ls' }, 'b1'), done('cancelled')]), al(...P())),
  cli('platform: done status unknown value', taskFile([frame('Bash', { command: 'ls' }, 'b1'), done('weird')]), al(...P())),
  cli('platform: done status not a string', taskFile([frame('Bash', { command: 'ls' }, 'b1'), done(['x'])]), al(...P())),
  cli('platform: two done frames, the last one wins', taskFile([frame('Bash', { command: 'ls' }, 'b1'), done('failed'), done('completed')]), al(...P())),
  cli('platform: no done frame', taskFile([frame('Bash', { command: 'ls' }, 'b1')]), al(...P())),
  cli('platform: empty stream', taskFile(''), al(...P())),
  cli('platform: only noise', taskFile('\n\n  \n[1,2]\n"x"\n5\nnull\n'), al(...P())),
  cli('platform: duplicate tool ids, result goes to the last', taskFile([frame('Bash', { command: 'one' }, 'd1'), frame('Bash', { command: 'two' }, 'd1'), result('d1', false)]), al(...P())),
  cli('platform: tool_result for an unknown id', taskFile([frame('Bash', { command: 'one' }, 'k1'), result('zzz', false)]), al(...P())),
  cli('platform: success is not a bool', taskFile([frame('Bash', { command: 'one' }, 'k1'), { type: 'step', data: { type: 'tool_result', data: { success: 1, tool_use_id: 'k1' } }, ts: 1 }]), al(...P())),
  cli('platform: nested subagents map parents', taskFile([{ type: 'step', data: { type: 'agent_start', data: { agent: 'scaffolding:reviewer', tool_use_id: 'p1' } }, ts: 1 }, { type: 'step', data: { type: 'agent_start', data: { agent: 'bad agent', tool_use_id: 'p2' } }, ts: 1 }, frame('Read', { file_path: '/a/b.ts' }, 'c1', 1792489380, 'p1'), frame('Read', { file_path: '/a/c.ts' }, 'c2', 1792489380, 'p2'), frame('Read', { file_path: '/a/d.ts' }, 'c3', 1792489380, 'unknown-parent')]), al(...P())),
  cli('platform: timestamps of every kind', taskFile([
    frame('Bash', { command: 'a' }, 'n1', 1792489380), frame('Bash', { command: 'b' }, 'n2', 1792489380.5), frame('Bash', { command: 'c' }, 'n3', -0.5),
    frame('Bash', { command: 'd' }, 'n4', true), frame('Bash', { command: 'e' }, 'n5', '2026-10-21T10:00:00.123Z'), frame('Bash', { command: 'f' }, 'n6', '2026-10-21 10:00:00'),
    frame('Bash', { command: 'g' }, 'n7', null), frame('Bash', { command: 'h' }, 'n8', 0), frame('Bash', { command: 'i' }, 'n9', 253402300800), frame('Bash', { command: 'j' }, 'n10', '2026-10-21T10:00:00Z\n'),
    frame('Bash', { command: 'k' }, 'n11', 1792489380.999999), frame('Bash', { command: 'l' }, 'n12', 1e11), frame('Bash', { command: 'm' }, 'n13', -62135596800), frame('Bash', { command: 'n' }, 'n14', '٢٠٢٦-١٠-٢١T١٠:٠٠:٠٠Z'),
  ]), al(...P(), ';;', ...R())),
  cli('platform: timestamp out of range aborts the run (fail-open)', taskFile([frame('Bash', { command: 'a' }, 'o1', 1e300)]), al(...P(), ';;', ...R())),
  cli('platform: NaN timestamp', taskFile([frame('Bash', { command: 'a' }, 'o1', 1792489380), '{"type":"step","data":{"type":"tool_call","data":{"tool":"Bash","input":{"command":"x"},"id":"o2"}},"ts":NaN}']), al(...P())),
  cli('platform: tool names of every kind', taskFile([
    frame('Bash', { command: 'x' }, 'q1'), frame(null, { command: 'x' }, 'q2'), frame(5, {}, 'q3'), frame('', {}, 'q4'), frame('bad name', {}, 'q5'), frame('a'.repeat(81), {}, 'q6'),
    frame('mcp__gitea__list_pull_requests', { owner: 'komluk', repo: 'x', state: 'open', token: 't', body: 'b' }, 'q7'), frame('mcp__single', { owner: 'o' }, 'q8'), frame('mcp__a__b__c', { owner: 'o' }, 'q9'),
    frame('NotebookEdit', { notebook_path: '/a/n.ipynb' }, 'q10'), frame('MultiEdit', { file_path: '/a/m.ts' }, 'q11'), frame('Agent', { subagent_type: 'scaffolding:dev', description: 'd'.repeat(100) }, 'q12'),
    frame('Grep', { pattern: 'p'.repeat(70), path: '/a' }, 'q13'), frame('Glob', { pattern: '**/*.ts' }, 'q14'), frame('WebSearch', { query: 'q'.repeat(70) }, 'q15'), frame('TodoWrite', { todos: [] }, 'q16'), frame('Edit', 'str', 'q17'), frame('Edit', null, 'q18'),
  ]), al(...P(), ';;', ...R())),
  cli('platform: ids that are not identifiers are dropped', taskFile([frame('Bash', { command: 'x' }, 'bad id'), frame('Bash', { command: 'y' }, 5), frame('Bash', { command: 'z' }, 'ok-1\n'), frame('Bash', { command: 'w' }, 'a'.repeat(81)), result('ok-1\n', false)]), al(...P())),
  cli('platform: Bash commands', taskFile([
    frame('Bash', { command: 'FOO=bar BAZ=qux make build', description: 'build it' }, 'c1'), frame('Bash', { command: '  \n  ls -la\nrm -rf x' }, 'c2'), frame('Bash', { command: 'cat <<EOF\nsecret\nEOF' }, 'c3'),
    frame('Bash', { command: 'echo aGk= | base64 -d' }, 'c4'), frame('Bash', { command: 'echo aGk= |   base64 -d' }, 'c5'), frame('Bash', { command: 'x'.repeat(200), description: 'y'.repeat(200) }, 'c6'),
    frame('Bash', { command: 'API_KEY=abc curl x' }, 'c7'), frame('Bash', { command: 'a=1  b=2' }, 'c8'), frame('Bash', { command: 'a=1\tb=2\tls' }, 'c9'), frame('Bash', { command: 5 }, 'c10'),
    frame('Bash', { command: 'ls', description: '  ' }, 'c11'), frame('Bash', { command: 'ls', description: 'two\nlines' }, 'c12'), frame('Bash', { command: 'ls', description: 7 }, 'c13'), frame('Bash', { command: 'żółć gęślą jaźń' }, 'c14'),
    frame('Bash', { command: 'curl -H "Authorization: Bearer abc.def" https://u:pw@h/x?token=zzz&a=1' }, 'c15'), frame('Bash', { command: 'mysql -u root:rootpw -p hunter22 --password=abc --api-key abc' }, 'c16'),
    frame('Bash', { command: 'a=\'quoted value\' b=2 ls' }, 'c17'), frame('Bash', { command: '=x ls' }, 'c18'), frame('Bash', { command: '1a=x ls' }, 'c19'), frame('Bash', { command: 'a=\u00a0b ls' }, 'c20'),
  ]), al(...P(), ';;', ...R())),
  cli('platform: paths relative to project / home', { [`proj/.scaffolding/conversations/${CONV}/tasks/r1/output.jsonl`]: plat([
    frame('Read', { file_path: '@SANDBOX@/proj/src/a.ts' }, 'p1'), frame('Read', { file_path: '@SANDBOX@/proj' }, 'p2'), frame('Read', { file_path: '@SANDBOX@/proj2/x' }, 'p3'), frame('Read', { file_path: '@SANDBOX@/home/n.md' }, 'p4'),
    frame('Read', { file_path: '@SANDBOX@/home' }, 'p5'), frame('Read', { file_path: '@SANDBOX@/homey/x' }, 'p6'), frame('Edit', { file_path: '', notebook_path: '/a/b' }, 'p7'), frame('Edit', { file_path: 5 }, 'p8'),
    frame('Grep', { pattern: 'x', path: '@SANDBOX@/proj/src' }, 'p9'), frame('Grep', { pattern: 'x', path: '' }, 'p10'), frame('Read', { file_path: '@SANDBOX@/proj/../proj/./b//c.ts' }, 'p11'), frame('Read', { file_path: '@SANDBOX@/proj/' }, 'p12'),
  ]) }, al('platform', '--task-dir', `@SANDBOX@/proj/.scaffolding/conversations/${CONV}/tasks/r1`, '--conv-dir', `@SANDBOX@/proj/.scaffolding/conversations/${CONV}`, ';;', 'render', '--conv-dir', `@SANDBOX@/proj/.scaffolding/conversations/${CONV}`)),
  cli('platform: WebFetch urls', taskFile([
    ...['https://example.com/p/q?x=1#f', 'http://user:pw@Host.Example:8080/a/b', 'HTTPS://EXAMPLE.com', 'https://[::1]:80/x', 'https://[2001:db8::1]/x', 'https://[fe80::1%25eth0]/x', 'ftp://h/x', '//h/x', 'h/x', 'example.com', 'https://', 'file:///etc/passwd',
      'https://h:abc/x', 'https://h:99999/x', 'https://h:/x', 'https://[::1/x', 'https://::1]/x', 'https://[1.2.3.4]/x', 'https://[vx.y]/x', 'https://[v1.a]/x', 'https://h\n/x', 'https://ex\tample.com/p', '  https://h/x', 'javascript:alert(1)', 'mailto:a@b.c',
      'https://h@/x', 'https://@h/x', 'https://a@b@c/x', 'https://exämple.com/ü', 'https://ex\u2100.com/x', 'https://h/x?', 'https://h?q#f', 'https://h:0/x', 'http://h:65535/x', 'http://h:065535/x', 'https://x.y:٣/z', '1http://h/x', 'ht+tp-.x://h/x', ':http://h/x', '', 5].map((u, i) => frame('WebFetch', { url: u }, `w${i}`)),
  ]), al(...P(), ';;', ...R())),
  cli('platform: secrets never reach the log', taskFile(platformRows()), al(...P(), '--force')),
  cli('platform: lone surrogate escape cannot be written', taskFile([frame('Bash', { command: 'echo ok' }, 'u1'), '{"type":"step","data":{"type":"tool_call","data":{"tool":"Bash","input":{"command":"echo \\ud800 x"},"id":"u2"}},"ts":1792489380}']), al(...P(), ';;', ...R())),
  cli('platform: stream encodings (BOM, CRLF, no trailing newline, invalid utf-8)', taskFile(Buffer.concat([
    Buffer.from('\ufeff' + J(frame('Bash', { command: 'bom' }, 'e1')) + '\n'), Buffer.from(J(frame('Bash', { command: 'crlf' }, 'e2')) + '\r\n'),
    Buffer.from(J(frame('Bash', { command: 'bad ' }, 'e3')).replace('bad ', 'bad \u0001') + '\n'), Buffer.concat([Buffer.from('{"type":"step","data":{"type":"tool_call","data":{"tool":"Bash","input":{"command":"inv'), Buffer.from([0xff]), Buffer.from('alid"},"id":"e4"}},"ts":1}\n')]),
    Buffer.from(J(frame('Bash', { command: 'last, no newline' }, 'e5'))),
  ])), al(...P(), ';;', ...R())),
  cli('platform: utf-16 and utf-32 json lines', taskFile(Buffer.concat([
    Buffer.from(J(frame('Bash', { command: 'u16le' }, 'f1')), 'utf16le'), Buffer.from('\n'), Buffer.from(J(frame('Bash', { command: 'plain' }, 'f2')) + '\n'),
  ])), al(...P())),
  cli('platform: odd fields in frames', taskFile([
    { type: 'step', data: 'x' }, { type: 'step', data: { type: 'tool_call', data: 'x' } }, { type: 'step', data: { type: 'tool_call' } }, { type: 'step', data: { data: { x: 1 } } }, { type: 'other', data: { type: 'tool_call', data: {} } },
    { type: 'step', data: { type: 'tool_call', data: { tool: 'Bash', input: { command: 'ok' }, id: 'g1', parent_tool_use_id: 5 } } },
    { type: 'step', data: { type: 'agent_start', data: { agent: 5, tool_use_id: 'x' } } }, { type: 'done', data: 'x' }, { type: 'done' },
  ]), al(...P(), ';;', ...R())),
  cli('platform: 5000 record cap keeps errors, edits, commands, agents', taskFile((() => {
    const rows = [];
    for (let i = 0; i < 5200; i++) rows.push(frame('Read', { file_path: `/f/${i}` }, `r${i}`));
    rows.push(frame('Bash', { command: 'echo keep' }, 'b1'), result('b1', false), frame('Edit', { file_path: '/e' }, 'e1'), frame('Task', { subagent_type: 'x' }, 't1'), frame('Grep', { pattern: 'x' }, 'g1'), frame('Read', { file_path: '/err' }, 'r-err'), result('r-err', false));
    return rows;
  })()), al(...P(), ';;', ...R())),
  cli('platform: 2 MB byte cap (long repo name)', { [`share/projects/${'r'.repeat(200)}/conversations/${CONV}/tasks/run-aaaa/output.jsonl`]: plat(Array.from({ length: 2600 }, (_, i) => frame('mcp__x__' + 'y'.repeat(60), { owner: 'o'.repeat(60), repo: 'r'.repeat(60), name: 'n'.repeat(60), path: 'p'.repeat(60) }, `m${i}`, 1792489380, 'parent-' + 'q'.repeat(60)))) }, al('platform', '--task-dir', `@SANDBOX@/share/projects/${'r'.repeat(200)}/conversations/${CONV}/tasks/run-aaaa`, '--conv-dir', `@SANDBOX@/share/projects/${'r'.repeat(200)}/conversations/${CONV}`, ';;', 'render', '--conv-dir', `@SANDBOX@/share/projects/${'r'.repeat(200)}/conversations/${CONV}`)),
];

// ---------------------------------------------------------------- local
const sid = SID;
const tpath = '@SANDBOX@/cc/' + sid + '.jsonl';
const L = (...extra) => ['local', '--transcript', tpath, '--session-id', sid, '--conv-dir', `@SANDBOX@/repo/.scaffolding/conversations/${sid}`, '--project-dir', '@SANDBOX@/repo', ...extra];
const LR = ['render', '--conv-dir', `@SANDBOX@/repo/.scaffolding/conversations/${sid}`];
const tfile = (rows) => ({ [`cc/${sid}.jsonl`]: raw(rows) ? rows : lines(rows) });
const sub = (name, rows, meta) => ({ [`cc/${sid}/subagents/agent-${name}.jsonl`]: lines(rows), ...(meta === undefined ? {} : { [`cc/${sid}/subagents/agent-${name}.meta.json`]: typeof meta === 'string' ? meta : J(meta) }) });
const T = (n) => `2026-10-21T10:${String(n % 60).padStart(2, '0')}:00.000Z`;
const use = (id, name, input, ts = T(0)) => tu(id, name, input, ts, sid);
const out = (id, err, ts = T(1)) => tr(id, err, 'ignored', ts, sid);
const half = localRows(sid, 0, 5);

const local = [
  cli('local: first pass, pending calls stay pending', { ...tfile(half), ...sub('abc', [tu('s1', 'Edit', { file_path: '/work/proj/sub.py' }, T(30), sid), tr('s1', false, 'ok', T(31), sid)], { agentType: 'scaffolding:debugger', toolUseId: 't7' }) }, al(...L(), ';;', ...LR)),
  cli('local: second pass adds nothing', tfile(half), al(...L(), ';;', ...L(), ';;', ...LR)),
  cli('local: growing transcript appends only new calls', { ...tfile(half), 'more.jsonl': lines(localRows(sid, 5, 6)) }, al(...L(), ';;', '!cat more.jsonl >> cc/' + sid + '.jsonl', ';;', ...L(), ';;', ...LR)),
  cli('local: --final flushes pending calls and writes the footer', tfile([use('a1', 'Bash', { command: 'ls' }), use('a2', 'Read', { file_path: '/x' }), out('a1', true)]), al(...L('--final'), ';;', ...LR)),
  cli('local: --final twice appends a second footer', tfile([use('a1', 'Bash', { command: 'ls' }), out('a1', false)]), al(...L('--final'), ';;', ...L('--final'))),
  cli('local: tool_use without id is emitted at once', tfile([use(null, 'Bash', { command: 'ls' }), use('bad id', 'Bash', { command: 'two' })]), al(...L(), ';;', ...LR)),
  cli('local: is_error variants', tfile([use('a1', 'Bash', { command: '1' }), out('a1', true), use('a2', 'Bash', { command: '2' }), out('a2', 'true'), use('a3', 'Bash', { command: '3' }), tr('a3', 1, 'x', T(2), sid), use('a4', 'Bash', { command: '4' }), tr('a4', null, 'x', T(2), sid), use('a5', 'Bash', { command: '5' }), { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a5' }] } }]), al(...L(), ';;', ...LR)),
  cli('local: several blocks in one message', tfile([{ type: 'assistant', timestamp: T(3), message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 'm1', name: 'Read', input: { file_path: '/a' } }, 'str', { type: 'tool_use', id: 'm2', name: 'Read', input: { file_path: '/b' } }, { type: 'tool_result', tool_use_id: 'm1', is_error: false }] } }, out('m2', true)]), al(...L(), ';;', ...LR)),
  cli('local: lines without tool_use / tool_result are skipped', tfile([{ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }, { type: 'summary' }, 'garbage {', use('z1', 'Read', { file_path: '/a' }), out('z1', false)]), al(...L(), ';;', ...LR)),
  cli('local: message / content of the wrong type', tfile([{ message: 'x' }, { message: { content: 'x' } }, { message: { content: null } }, '[1]', '"tool_use"', 'null', '5']), al(...L())),
  cli('local: subagents with and without meta, sorted by name', { ...tfile([use('t7', 'Task', { subagent_type: 'scaffolding:developer' }), out('t7', false)]), ...sub('b2', [tu('s2', 'Edit', { file_path: '/b' }, T(5), sid), tr('s2', false, '', T(6), sid)], { agentType: 'scaffolding:reviewer', toolUseId: 't7' }), ...sub('a1', [tu('s1', 'Edit', { file_path: '/a' }, T(5), sid), tr('s1', true, '', T(6), sid)]), ...sub('c3', [tu('s3', 'Read', { file_path: '/c' }, T(7), sid), tr('s3', false, '', T(8), sid)], '{broken'), ...sub('d4', [tu('s4', 'Read', { file_path: '/d' }, T(7), sid), tr('s4', false, '', T(8), sid)], { agentType: 'x y', toolUseId: 'bad id' }) }, al(...L(), ';;', ...LR)),
  cli('local: subagent meta of the wrong type aborts the pass', { ...tfile([use('t7', 'Task', { subagent_type: 'x' }), out('t7', false)]), ...sub('a1', [tu('s1', 'Edit', { file_path: '/a' }, T(5), sid)], '[1]') }, al(...L(), ';;', ...LR)),
  cli('local: other files in subagents/ are ignored', { ...tfile([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]), [`cc/${sid}/subagents/notes.jsonl`]: lines([use('x1', 'Read', { file_path: '/zzz' }), out('x1', false)]), [`cc/${sid}/subagents/agent-q.txt`]: 'x' }, al(...L(), ';;', ...LR)),
  cli('local: project dir from CLAUDE_PROJECT_DIR', { ...tfile([use('t1', 'Read', { file_path: '@SANDBOX@/repo/src/a.ts' }), out('t1', false)]) }, al('local', '--transcript', tpath, '--session-id', sid, '--conv-dir', `@SANDBOX@/repo/.scaffolding/conversations/${sid}`), { env: { CLAUDE_PROJECT_DIR: '@SANDBOX@/repo' } }),
  cli('local: no project dir at all', tfile([use('t1', 'Read', { file_path: '/home/x/a.ts' }), out('t1', false)]), al('local', '--transcript', tpath, '--session-id', sid, '--conv-dir', `@SANDBOX@/repo/.scaffolding/conversations/${sid}`)),
  cli('local: invalid session id', tfile([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]), al('local', '--transcript', tpath, '--session-id', 'bad id', '--conv-dir', `@SANDBOX@/repo/.scaffolding/conversations/${sid}`)),
  cli('local: missing transcript', { x: '' }, al(...L())),
  cli('local: transcript not ending in .jsonl', { [`cc/${sid}.log`]: lines([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]) }, al('local', '--transcript', `@SANDBOX@/cc/${sid}.log`, '--session-id', sid, '--conv-dir', `@SANDBOX@/repo/.scaffolding/conversations/${sid}`)),
  cli('local: corrupt cursor is ignored', { ...tfile([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]), [`repo/.scaffolding/conversations/${sid}/actions/.cursor.json`]: '{broken' }, al(...L(), ';;', ...LR)),
  cli('local: cursor of the wrong shape aborts the pass', { ...tfile([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]), [`repo/.scaffolding/conversations/${sid}/actions/.cursor.json`]: '{"files": 5, "seq": "x"}' }, al(...L(), ';;', ...LR)),
  cli('local: cursor with string numbers and bool resync', { ...tfile([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]), [`repo/.scaffolding/conversations/${sid}/actions/.cursor.json`]: J({ seq: '3', count: 2.9, bytes: true, truncated: ' 4 ', files: {}, pending: {} }) }, al(...L(), ';;', ...LR)),
  cli('local: cursor offset beyond the file restarts from 0', { ...tfile([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]), [`repo/.scaffolding/conversations/${sid}/actions/.cursor.json`]: J({ files: { [`/@x`]: { off: 1 }, [tpath.replace('@SANDBOX@', '__S__')]: { off: 99999 } } }) }, al(...L(), ';;', ...LR)),
  cli('local: a transcript that was truncated and rewritten', tfile(half), al(...L(), ';;', '!printf "" > cc/' + sid + '.jsonl', ';;', ...L(), ';;', ...LR)),
  cli('local: unterminated last line is not consumed yet', { ...tfile(lines([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]) + J(use('t2', 'Read', { file_path: '/b' }))), 'rest.jsonl': '\n' + J(out('t2', false)) + '\n' }, al(...L(), ';;', '!cat rest.jsonl >> cc/' + sid + '.jsonl', ';;', ...L(), ';;', ...LR)),
  cli('local: the 10 MB budget limits one pass', tfile((() => { const rows = []; for (let i = 0; i < 2600; i++) rows.push(use(`b${i}`, 'Read', { file_path: `/f/${i}` }), out(`b${i}`, false), { type: 'assistant', message: { content: [{ type: 'text', text: 'x'.repeat(4000) }] } }); return rows; })()), al(...L(), ';;', ...L(), ';;', ...L(), ';;', ...LR)),
  cli('local: one line longer than the budget is skipped', tfile(Buffer.concat([Buffer.from(lines([use('t1', 'Read', { file_path: '/a' }), out('t1', false)])), Buffer.from('{"x":"' + 'y'.repeat(10 * 1024 * 1024 + 100) + '"}\n'), Buffer.from(lines([use('t2', 'Read', { file_path: '/b' }), out('t2', false)]))])), al(...L(), ';;', ...L(), ';;', ...L(), ';;', ...LR)),
  cli('local: 5000 record cap, errors and commands survive', tfile((() => { const rows = []; for (let i = 0; i < 5100; i++) rows.push(use(`c${i}`, 'Read', { file_path: `/f/${i}` }), out(`c${i}`, false)); rows.push(use('x1', 'Bash', { command: 'echo keep' }), out('x1', true), use('x2', 'Read', { file_path: '/err' }), out('x2', true), use('x3', 'Grep', { pattern: 'p' }), out('x3', false)); return rows; })()), al(...L('--final'), ';;', ...LR)),
  cli('local: timestamps of every kind', tfile([use('t1', 'Read', { file_path: '/a' }, T(1)), out('t1', false), use('t2', 'Read', { file_path: '/b' }, 5), out('t2', false), use('t3', 'Read', { file_path: '/c' }, null), out('t3', false), use('t4', 'Read', { file_path: '/d' }, 'not a time'), out('t4', false), use('t5', 'Read', { file_path: '/e' }, '2026-10-21T10:00:00Z'), out('t5', false), use('t6', 'Read', { file_path: '/f' }, 1792489380.25), out('t6', false)]), al(...L(), ';;', ...LR)),
  cli('local: unicode targets', tfile([use('t1', 'Bash', { command: 'echo "zażółć gęślą jaźń 😀"' }), out('t1', false), use('t2', 'Read', { file_path: '/ą/ę/ś.ts' }), out('t2', false)]), al(...L(), ';;', ...LR)),
  cli('local: secrets never reach the log or the timeline', tfile(localRows(sid, 0, 11)), al(...L('--final'), ';;', ...LR)),
  cli('local: repeated failures, ids and hashes normalised', tfile([...[1, 2, 3].flatMap((n) => [use(`r${n}`, 'Bash', { command: `deploy build-${n} abcdef${n}0123` }), out(`r${n}`, true)]), ...[1, 2].flatMap((n) => [use(`q${n}`, 'Bash', { command: 'tofu apply' }), out(`q${n}`, true)])]), al(...L('--final'), ';;', ...LR)),
  cli('local: rotation gzips the oldest run files', { ...tfile([use('t1', 'Read', { file_path: '/a' }), out('t1', false)]), [`repo/.scaffolding/conversations/${sid}/actions/old-1.jsonl`]: lines([{ v: 1, run: 'old-1', ts: '2026-01-01T00:00:00.000Z', tool: 'Read', kind: 'read', status: 'ok', target: '/o' }]) + 'x'.repeat(30 * 1024 * 1024) + '\n', [`repo/.scaffolding/conversations/${sid}/actions/old-2.jsonl`]: lines([{ v: 1, run: 'old-2', ts: '2026-01-02T00:00:00.000Z', tool: 'Read', kind: 'read', status: 'ok', target: '/p' }]) + 'x'.repeat(30 * 1024 * 1024) + '\n' }, al('!touch -d "2026-01-01 00:00:00" repo/.scaffolding/conversations/' + sid + '/actions/old-1.jsonl; touch -d "2026-01-02 00:00:00" repo/.scaffolding/conversations/' + sid + '/actions/old-2.jsonl', ';;', ...L(), ';;', ...LR), { after: [...STATE, 'ls repo/.scaffolding/conversations/' + sid + '/actions | sort'] }),
];

// ---------------------------------------------------------------- render
const runFile = (run, recs, conv = CONV) => ({ [`${BASE.replace(CONV, conv)}/actions/${run}.jsonl`]: lines(recs) });
const rec = (run, n, extra = {}) => ({ v: 1, ts: `2026-10-2${n % 9}T10:${String(n % 60).padStart(2, '0')}:00.000Z`, src: 'platform', conv: CONV, run, repo: 'proj', agent: 'main', seq: n, id: `i${n}`, tool: 'Bash', kind: 'exec', target: `cmd ${n}`, status: 'ok', ...extra });
const foot = (run, status = 'completed') => ({ v: 1, run, end: true, status, calls: 0, errors: 0, truncated: 0 });
const render = [
  cli('render: nothing to render prints nothing', { x: '' }, al(...R())),
  cli('render: empty actions dir', { [`${BASE}/actions/.keep`]: '' }, al(...R())),
  cli('render: a single run, every kind', runFile('run-1', [rec('run-1', 1), rec('run-1', 2, { kind: 'edit', tool: 'Edit', target: 'src/a.ts' }), rec('run-1', 3, { kind: 'read', tool: 'Read', target: 'src/a.ts' }), rec('run-1', 4, { kind: 'read', tool: 'Read', target: 'src/b.ts' }), rec('run-1', 5, { kind: 'mcp', tool: 'mcp__x__y', target: 'y owner=o' }), rec('run-1', 6, { kind: 'agent', tool: 'Task', target: 'dev: x', agent: 'reviewer' }), rec('run-1', 7, { status: 'error' }), rec('run-1', 8, { status: 'error' }), foot('run-1')]), al(...R())),
  cli('render: more than 10 runs collapse the older ones', Object.assign({}, ...Array.from({ length: 14 }, (_, i) => runFile(`run-${String(i).padStart(2, '0')}`, [rec(`run-${String(i).padStart(2, '0')}`, i + 1, { status: i % 3 ? 'ok' : 'error' }), foot(`run-${String(i).padStart(2, '0')}`, i % 2 ? 'failed' : 'completed')]))), al(...R())),
  cli('render: runs sorted by first timestamp, missing ts first', { ...runFile('b-run', [rec('b-run', 5)]), ...runFile('a-run', [rec('a-run', 2)]), ...runFile('c-run', [rec('c-run', 3, { ts: null })]) }, al(...R())),
  cli('render: repeated failures across runs', { ...runFile('r1', [rec('r1', 1, { status: 'error', target: 'deploy 11' }), rec('r1', 2, { status: 'error', target: 'deploy 22' })]), ...runFile('r2', [rec('r2', 3, { status: 'error', target: 'deploy 3' }), rec('r2', 4, { status: 'error', tool: 'Edit', kind: 'edit', target: 'f' })]) }, al(...R())),
  cli('render: > 200 lines are truncated', Object.assign({}, ...Array.from({ length: 12 }, (_, i) => runFile(`r${String(i).padStart(2, '0')}`, Array.from({ length: 30 }, (_, k) => rec(`r${String(i).padStart(2, '0')}`, i * 30 + k + 1, { kind: 'edit', tool: 'Edit', target: `file-${i}-${k}` }))))), al(...R())),
  cli('render: gzipped run files are read', { ...runFile('r1', [rec('r1', 1)]), [`${BASE}/actions/r0.jsonl`]: lines([rec('r0', 0), foot('r0')]) }, al('!gzip -9 ' + `${BASE}/actions/r0.jsonl`, ';;', ...R())),
  cli('render: truncated gzip run file', { [`${BASE}/actions/r0.jsonl`]: lines(Array.from({ length: 400 }, (_, i) => rec('r0', i + 1))), ...runFile('r1', [rec('r1', 1)]) }, al('!gzip -9 ' + `${BASE}/actions/r0.jsonl`, ';;', `!truncate -s -40 ${BASE}/actions/r0.jsonl.gz`, ';;', ...R())),
  cli('render: corrupt gzip run file is skipped', { [`${BASE}/actions/r0.jsonl.gz`]: 'not gzip at all', ...runFile('r1', [rec('r1', 1)]) }, al(...R())),
  cli('render: dotfiles and other names in actions/', { ...runFile('r1', [rec('r1', 1)]), [`${BASE}/actions/.cursor.json`]: '{"seq": 1}', [`${BASE}/actions/.hidden.jsonl`]: lines([rec('h', 1)]), [`${BASE}/actions/notes.txt`]: 'x', [`${BASE}/actions/r2.jsonl.bak`]: lines([rec('bak', 1)]) }, al(...R())),
  cli('render: records of odd shapes', runFile('r1', [rec('r1', 1, { target: null, tool: null }), rec('r1', 2, { target: '', tool: 'T' }), rec('r1', 3, { agent: null }), rec('r1', 4, { agent: '' }), rec('r1', 5, { kind: 'zzz' }), rec('r1', 6, { ts: 5 }), '[1]', '"x"', 'null', '{"end": 0}', rec('r1', 7, { run: null })]), al(...R())),
  cli('render: target of the wrong type', runFile('r1', [rec('r1', 1, { status: 'error', target: 5 })]), al(...R())),
  cli('render: list-valued kind', runFile('r1', [rec('r1', 1, { kind: ['a'] })]), al(...R())),
  cli('render: mixed ts types', runFile('r1', [rec('r1', 1, { ts: 5 }), rec('r1', 2)]), al(...R())),
  cli('render: secrets in records are masked by pass 2', runFile('r1', [rec('r1', 1, { target: `curl -H "Authorization: Bearer ${SECRETS[1]}" ${SECRETS[3]} VAULT_TOKEN=${SECRETS[0]}` }), rec('r1', 2, { target: SECRETS[4] })]), al(...R())),
  cli('render: unicode run ids, agents and targets', runFile('ąęś-run-with-a-long-name', [rec('ąęś-run-with-a-long-name', 1, { target: 'zażółć gęślą jaźń 😀', agent: 'żółw' })]), al(...R())),
  cli('render: invalid utf-8 in a run file aborts the render', { [`${BASE}/actions/r1.jsonl`]: Buffer.concat([Buffer.from(J(rec('r1', 1)) + '\n'), Buffer.from([0xff, 0x0a])]) }, al(...R())),
  cli('render: CRLF and no trailing newline', { [`${BASE}/actions/r1.jsonl`]: J(rec('r1', 1)) + '\r\n' + J(rec('r1', 2)) }, al(...R())),
  cli('render: conv dir with trailing slash', runFile('r1', [rec('r1', 1)]), al('render', '--conv-dir', ROOT + '/')),
  cli('render: timeline.md is replaced atomically', { ...runFile('r1', [rec('r1', 1)]), [`${BASE}/timeline.md`]: 'old\n' }, al(...R())),
];

// ---------------------------------------------------------------- backfill + usage
const bf = (conv, run, rows) => ({ [`root/proj-b/conversations/${conv}/tasks/${run}/output.jsonl`]: plat(rows) });
const backfill = [
  cli('backfill: walks repos / conversations / tasks, then renders', { ...bf('c-1', 'r-1', platformRows()), ...bf('c-1', 'r-2', [frame('Bash', { command: 'ls' }, 'x1')]), ...bf('c-2', 'r-3', [frame('Bash', { command: 'pwd' }, 'x2')]), 'root/proj-a/other/file': '', 'root/zfile': 'x', 'root/proj-b/conversations/no-tasks/readme': '' }, al('backfill', '@SANDBOX@/root')),
  cli('backfill: rerun skips existing logs', { ...bf('c-1', 'r-1', platformRows()) }, al('backfill', '@SANDBOX@/root', ';;', 'backfill', '@SANDBOX@/root')),
  cli('backfill: empty root', { 'root/x': '' }, al('backfill', '@SANDBOX@/root')),
  cli('backfill: missing root fails open', { x: '' }, al('backfill', '@SANDBOX@/nope')),
  cli('backfill: root is a file', { 'root': 'x' }, al('backfill', '@SANDBOX@/root')),
  cli('backfill: invalid task names are skipped', { ...bf('c-1', 'bad run', [frame('Bash', { command: 'ls' }, 'x1')]), ...bf('c 2', 'r-1', [frame('Bash', { command: 'ls' }, 'x1')]) }, al('backfill', '@SANDBOX@/root')),
  cli('backfill: a failing task does not stop the others', { ...bf('c-1', 'r-1', [frame('Bash', { command: 'ls' }, 'x1', 1e300)]), ...bf('c-1', 'r-2', [frame('Bash', { command: 'pwd' }, 'x2')]) }, al('backfill', '@SANDBOX@/root')),
];

const usage = [
  ['no arguments', ''], ['-h', '-h'], ['--help', '--help'], ['unknown command', 'bogus'], ['command prefix', 'pla'], ['unknown option', '--zz'], ['platform -h', 'platform\n-h'], ['render --help', 'render\n--help'],
  ['local -h', 'local\n-h'], ['backfill -h', 'backfill\n-h'], ['render without --conv-dir', 'render'], ['render --conv-dir without value', 'render\n--conv-dir'], ['render --conv-dir --x', 'render\n--conv-dir\n--x'], ['render --conv-dir -5', 'render\n--conv-dir\n-5'],
  ['render --conv-dir a b', 'render\n--conv-dir\na b'], ['render --conv-dir -a b', 'render\n--conv-dir\n-a b'], ['render extra positional', 'render\n--conv-dir\nx\nextra'], ['render unknown option', 'render\n--conv-dir\nx\n--zz'], ['render -- separator', 'render\n--\n--conv-dir\nx'],
  ['platform missing required', 'platform\n--task-dir\nx'], ['platform ambiguous --c', 'platform\n--c\nx'], ['platform --f=1 (flag with value)', 'platform\n--task-dir\nx\n--conv-dir\ny\n--f=1'], ['local ambiguous --s', 'local\n--s\nx'],
  ['local -x short option', 'local\n-x'], ['local --final=1', 'local\n--transcript\na\n--session-id\nb\n--conv-dir\nc\n--final=1'], ['backfill without root', 'backfill'], ['backfill two roots', 'backfill\na\nb'], ['backfill root -5', 'backfill\n-5'], ['backfill -- -root', 'backfill\n--\n-root'],
  ['backfill root with space and dash', 'backfill\n-a b'], ['-h after command', 'render\n--conv-dir\nx\n-h'], ['-hx', '-hx'], ['top-level --conv-dir', '--conv-dir\nx'], ['combined short -h', 'platform\n-hh'], ['empty string command', '\u0000'],
].map(([n, a]) => ({ name: `usage: ${n}`, env: { AL_ARGS: a.replace('\u0000', '') }, after: ['echo state-empty'], keepDates: true }));

// ---------------------------------------------------------------- the shim (hooks/action-log.sh)
const hookCase = (name, stdin, env, files, after) => ({ name, stdin: typeof stdin === 'string' ? stdin : J(stdin), env: { CLAUDE_PROJECT_DIR: '@SANDBOX@/repo', ...env }, files: { ...files, 'repo/.scaffolding/conversations/.keep': '' }, after: after ?? STATE, keepDates: true });
const ev = (name = 'Stop', extra = {}) => ({ session_id: sid, transcript_path: tpath, hook_event_name: name, ...extra });
const ON = { ACTION_LOG_ENABLED: '1' };
const T1 = tfile([use('t1', 'Bash', { command: 'VAULT_TOKEN=abc ls' }), out('t1', false), use('t2', 'Read', { file_path: '@SANDBOX@/repo/a.ts' })]);
const shim = [
  hookCase('Stop logs the transcript and renders', ev(), ON, T1),
  hookCase('SessionEnd flushes pending and writes the footer', ev('SessionEnd'), ON, T1),
  hookCase('second Stop adds nothing', ev(), ON, T1),
  hookCase('no opt-in: nothing written', ev(), {}, T1),
  ...['0', 'false', 'no', 'off', ''].map((v) => hookCase(`ACTION_LOG_ENABLED=${JSON.stringify(v)}: nothing written`, ev(), { ACTION_LOG_ENABLED: v }, T1)),
  ...['TRUE', 'Yes', 'ON', 'true', 'on'].map((v) => hookCase(`ACTION_LOG_ENABLED=${v} opts in`, ev(), { ACTION_LOG_ENABLED: v }, T1)),
  hookCase('sentinel .actionlog opts in', ev(), {}, { ...T1, 'repo/.scaffolding/.actionlog': '' }),
  hookCase('.noactionlog beats opt-in', ev(), ON, { ...T1, 'repo/.scaffolding/.noactionlog': '' }),
  hookCase('SCAFFOLDING_ACTION_LOG=off beats opt-in', ev(), { ...ON, SCAFFOLDING_ACTION_LOG: 'off' }, T1),
  hookCase('SCAFFOLDING_TASK_ID beats opt-in', ev(), { ...ON, SCAFFOLDING_TASK_ID: 'x' }, T1),
  hookCase('no conversations dir: nothing', ev(), ON, { ...T1 }, ['rm -rf repo/.scaffolding/conversations', ...STATE]),
  hookCase('session id too short', ev('Stop', { session_id: 'short' }), ON, T1),
  hookCase('session id with a slash', ev('Stop', { session_id: '../../etc/passwd-aaaa' }), ON, T1),
  hookCase('session id 64 chars ok', ev('Stop', { session_id: 'a'.repeat(64) }), ON, T1),
  hookCase('session id 65 chars rejected', ev('Stop', { session_id: 'a'.repeat(65) }), ON, T1),
  hookCase('session id not a string', ev('Stop', { session_id: 12345678 }), ON, T1),
  hookCase('transcript_path not .jsonl', ev('Stop', { transcript_path: '@SANDBOX@/cc/x.log' }), ON, { ...T1, 'cc/x.log': 'x' }),
  hookCase('transcript_path missing on disk', ev('Stop', { transcript_path: '@SANDBOX@/cc/none.jsonl' }), ON, T1),
  hookCase('transcript_path not a string', ev('Stop', { transcript_path: ['x.jsonl'] }), ON, T1),
  hookCase('hook_event_name absent behaves like Stop', { session_id: sid, transcript_path: tpath }, ON, T1),
  hookCase('hook_event_name other than SessionEnd', ev('PreCompact'), ON, T1),
  hookCase('bad stdin: garbage', 'garbage', ON, T1),
  hookCase('bad stdin: empty', '', ON, T1),
  hookCase('bad stdin: array', '[1,2]', ON, T1),
  hookCase('bad stdin: string', '"x"', ON, T1),
  hookCase('bad stdin: BOM', '\ufeff' + J(ev()), ON, T1),
  hookCase('stdin with unicode and escapes', J(ev('Stop', { x: 'zażółć \u0001' })), ON, T1),
  hookCase('project dir with spaces', ev('Stop', { transcript_path: '@SANDBOX@/cc dir/' + sid + '.jsonl' }), { ...ON, CLAUDE_PROJECT_DIR: '@SANDBOX@/my repo' }, { [`cc dir/${sid}.jsonl`]: lines([use('t1', 'Read', { file_path: '@SANDBOX@/my repo/a.ts' }), out('t1', false)]), 'my repo/.scaffolding/conversations/.keep': '' }, ['find . -path ./home -prune -o -path ./bin -prune -o -type f ! -name ".lock" -print | sort | while IFS= read -r f; do echo "== $f"; cat "$f"; done']),
  hookCase('CLAUDE_PROJECT_DIR unset uses PWD', ev(), { ...ON, CLAUDE_PROJECT_DIR: null }, { ...T1, '.scaffolding/conversations/.keep': '' }, [`(${STATE.join('\n')}) | sed -E 's/parity-[A-Za-z0-9]+/@REPO@/g'`]),
];

export default [
  { hook: 'action-log-cli.sh', helper: true, cases: [...platform, ...local, ...render, ...backfill, ...usage] },
  { hook: 'action-log.sh', cases: shim },
];
