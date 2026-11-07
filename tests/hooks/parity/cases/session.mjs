import { j } from './_util.mjs';

const P = '@SANDBOX@/proj';
const E = (extra = {}) => ({ CLAUDE_PROJECT_DIR: P, ...extra });
const treeState = ['cd proj 2>/dev/null || exit 0', 'find . -path ./.git -prune -o -print | sort', 'cat .scaffolding/project-id 2>/dev/null'];

const init = (name, setup, env = {}, extra = {}) => ({ name, stdin: '', env: E(env), setup: ['mkdir -p proj', ...setup], after: treeState, ...extra });
const ROUTED = ["printf '@~/.claude/CLAUDE.md\\n' > proj/CLAUDE.md", 'mkdir -p proj/.claude', 'echo {} > proj/.claude/settings.json'];

const pid = (name, setup, env = {}, extra = {}) => ({ name, stdin: '', env: E(env), setup: ['mkdir -p proj', ...setup], after: treeState, ...extra });
const git = (url) => ['git init -q proj', `git -C proj remote add origin '${url}'`];

export default [
  {
    hook: 'auto-init-check.sh',
    cases: [
      init('nothing initialised: advisory with both missing', []),
      init('only settings.json present', ['mkdir -p proj/.claude', 'echo {} > proj/.claude/settings.json']),
      init('only CLAUDE.md with @import', ["printf '@~/.claude/CLAUDE.md\\n' > proj/CLAUDE.md"]),
      init('CLAUDE.md with literal protocol + settings: initialised', ['printf \'Task(subagent_type="scaffolding:developer")\\n\' > proj/CLAUDE.md', 'mkdir -p proj/.claude', 'echo {} > proj/.claude/settings.json']),
      init('fully initialised: silent', ROUTED),
      init('CLAUDE.md without protocol + settings', ["printf '# plain\\n' > proj/CLAUDE.md", 'mkdir -p proj/.claude', 'echo {} > proj/.claude/settings.json']),
      init('platform run (TASK_ID set): silent no-op', [], { SCAFFOLDING_TASK_ID: 'x1' }),
      init('empty TASK_ID is not a platform run', [], { SCAFFOLDING_TASK_ID: '' }),
      init('project dir with spaces and unicode', ['mkdir -p "pro j/ąę"'], { CLAUDE_PROJECT_DIR: '@SANDBOX@/pro j/ąę' }, { after: ['find "pro j" | sort'] }),
      init('project dir with a double quote', ['mkdir -p \'q"d\''], { CLAUDE_PROJECT_DIR: '@SANDBOX@/q"d' }, { after: ['find . -path ./proj -prune -o -name "q*" -print | sort'] }),
      init('CLAUDE_PROJECT_DIR unset: uses PWD', [], { CLAUDE_PROJECT_DIR: null }, { after: ['find . -path ./home -prune -o -path ./bin -prune -o -print | sort'] }),
      init('existing skeleton dirs are kept', ['mkdir -p proj/.scaffolding/agent-memory/shared proj/.scaffolding/conversations; echo keep > proj/.scaffolding/agent-memory/shared/K.md']),
      init('read-only project dir: skeleton best effort', ['chmod 555 proj']),
    ],
  },
  {
    hook: 'memory-project-id.sh',
    cases: [
      pid('github https remote', git('https://github.com/komluk/scaffolding.git')),
      pid('scp style remote', git('git@github.com:komluk/scaffolding.git')),
      pid('ssh url with port, mixed case', git('ssh://git@Gitea.Example:22/Komluk/Scaffolding.git')),
      pid('trailing slash remote', git('https://h/komluk/scaffolding/')),
      pid('no .git suffix', git('https://h/komluk/scaffolding')),
      pid('no remote: path fallback', ['git init -q proj']),
      pid('not a git repo: path fallback', []),
      pid('single segment remote falls back to raw remote', git('onlyname')),
      pid('local path remote', git('/srv/git/repo.git')),
      pid('remote with unicode owner', git('https://h/ąę/zażółć.git')),
      pid('nested group remote keeps last two segments', git('https://h/g/sub/owner/repo.git')),
      pid('project dir with spaces', ['mkdir -p "pro j"; git init -q "pro j"'], { CLAUDE_PROJECT_DIR: '@SANDBOX@/pro j' }, { after: ['cat "pro j/.scaffolding/project-id"'] }),
      pid('project dir with a double quote', ['mkdir -p \'q"d\''], { CLAUDE_PROJECT_DIR: '@SANDBOX@/q"d' }, { after: ['cat \'q"d/.scaffolding/project-id\''] }),
      pid('project dir with backslash and unicode', ['mkdir -p \'b\\s/ąę\''], { CLAUDE_PROJECT_DIR: '@SANDBOX@/b\\s/ąę' }, { after: ['cat \'b\\s/ąę/.scaffolding/project-id\''] }),
      pid('CLAUDE_PROJECT_DIR unset: uses PWD', ['git init -q .'], { CLAUDE_PROJECT_DIR: null }, { after: ['cat .scaffolding/project-id'] }),
      pid('existing project-id is overwritten', [...git('https://h/a/b.git'), 'mkdir -p proj/.scaffolding; echo stale > proj/.scaffolding/project-id']),
      pid('unwritable .scaffolding: output still emitted', [...git('https://h/a/b.git'), 'mkdir -p proj/.scaffolding; chmod 555 proj/.scaffolding']),
    ],
  },
  {
    hook: 'refresh-mcp-token.sh',
    cases: [
      { name: 'no vault CLI: no-op', stdin: '', setup: ['rm bin/vault', 'mkdir -p home/.claude', "echo '{}' > home/.claude/settings.json"], after: ['cat home/.claude/settings.json'] },
      { name: 'no settings file: no-op', stdin: '', env: { FAKE_VAULT_TOKEN: 'abcdefghijklmnopqrstuvwx' }, setup: [], after: ['ls home; ls home/.claude 2>&1'] },
      { name: 'vault fails: keeps existing', stdin: '', setup: ['mkdir -p home/.claude', 'echo \'{"env":{"MEMORY_MCP_TOKEN":"old"}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'empty token rejected', stdin: '', env: { FAKE_VAULT_TOKEN: '' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{"MEMORY_MCP_TOKEN":"old"}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'token containing Error rejected', stdin: '', env: { FAKE_VAULT_TOKEN: 'xxxxxxxxxxxxxxxxxxxxError' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{"MEMORY_MCP_TOKEN":"old"}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'token containing denied rejected', stdin: '', env: { FAKE_VAULT_TOKEN: 'permission denied for path abc' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{"MEMORY_MCP_TOKEN":"old"}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'token shorter than 16 rejected', stdin: '', env: { FAKE_VAULT_TOKEN: '123456789012345' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{"MEMORY_MCP_TOKEN":"old"}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'token exactly 16 accepted', stdin: '', env: { FAKE_VAULT_TOKEN: '1234567890123456' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{"MEMORY_MCP_TOKEN":"old"}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json; stat -c %a home/.claude/settings.json'] },
      { name: 'unchanged token: file untouched', stdin: '', env: { FAKE_VAULT_TOKEN: 'tok-tok-tok-tok-tok' }, setup: ['mkdir -p home/.claude', 'printf \'{"env":{"MEMORY_MCP_TOKEN":"tok-tok-tok-tok-tok"},   "x":1}\' > home/.claude/settings.json; chmod 644 home/.claude/settings.json; touch -d @1700000000 home/.claude/settings.json'], after: ['cat home/.claude/settings.json; stat -c "%a %Y" home/.claude/settings.json'] },
      { name: 'updates token, keeps other settings, mode 600', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{"MEMORY_MCP_TOKEN":"old","OTHER":"1"},"permissions":{"allow":["Bash","Read"]},"n":[1,2,{"a":null}],"f":1.5,"t":true}\' > home/.claude/settings.json; chmod 644 home/.claude/settings.json'], after: ['cat home/.claude/settings.json; stat -c %a home/.claude/settings.json; ls -A home/.claude'] },
      { name: 'adds env block when missing', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"a":1}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'adds token key when env empty', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'empty containers keep python formatting', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{},"a":[],"b":{},"c":[[],{}]}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'non-ascii settings are escaped like json.dump', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'printf \'{"env":{},"note":"zażółć 😀 \\\\u00e9 \\\\/ tab\\\\t","k\\\\u0105":1}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'control chars and DEL in strings', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'printf \'{"env":{},"c":"\\\\u0001\\\\u001f\\\\u007f\\\\b\\\\f\\\\r\\\\n"}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'number forms round-trip', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{},"n":[0,-0,1e3,1E-7,2.50,1.0,-0.0,123456789012345678901234567890,1e400,0.1,100000000000000000.0,1e16,1e15,12345678.9,0.0001,0.00001]}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'NaN and Infinity round-trip', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{},"n":[NaN,Infinity,-Infinity]}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'duplicate keys: last wins, first position', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"a":1,"env":{},"a":2}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'integer-like keys keep insertion order', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{},"b":1,"2":1,"1":1,"a":1}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'token with quotes and backslash and unicode', stdin: '', env: { FAKE_VAULT_TOKEN: 'ab"cd\\ef zażółć 😀 gh' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'token with trailing newline is trimmed by $()', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new\n\n' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'token with inner newline', stdin: '', env: { FAKE_VAULT_TOKEN: 'line-one-line-one\nline-two' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'malformed settings untouched', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{broken\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json; ls -A home/.claude'] },
      { name: 'empty settings untouched', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', ': > home/.claude/settings.json'], after: ['cat home/.claude/settings.json; ls -A home/.claude'] },
      { name: 'settings is a list: untouched', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'[1,2]\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json; ls -A home/.claude'] },
      { name: 'env is not an object: untouched', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":"x"}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json; ls -A home/.claude'] },
      { name: 'env is null: untouched', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":null}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json; ls -A home/.claude'] },
      { name: 'existing token is non-string', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{"MEMORY_MCP_TOKEN":5}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'unwritable settings dir: silent', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{}}\' > home/.claude/settings.json', 'chmod 555 home/.claude'], after: ['cat home/.claude/settings.json; ls -A home/.claude'] },
      { name: 'settings with CRLF and BOM', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'printf \'\\xef\\xbb\\xbf{"env":{}}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json | od -c | head -3'] },
      { name: 'settings with CRLF whitespace', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'printf \'{\\r\\n "env": {}\\r\\n}\\r\\n\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
      { name: 'settings with invalid utf-8', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'printf \'{"env":{},"x":"\\xff"}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json | od -c | head -3'] },
      { name: 'settings is a symlink: replaced by a regular file', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude real', 'echo \'{"env":{}}\' > real/s.json', 'ln -s ../../real/s.json home/.claude/settings.json'], after: ['ls -l home/.claude | sed "s/.* //"; cat real/s.json; echo ---; cat home/.claude/settings.json'] },
      { name: 'deeply nested structure', stdin: '', env: { FAKE_VAULT_TOKEN: 'new-token-new-token-new' }, setup: ['mkdir -p home/.claude', 'echo \'{"env":{},"d":[[[[[[{"a":[{"b":[]}]}]]]]]]}\' > home/.claude/settings.json'], after: ['cat home/.claude/settings.json'] },
    ],
  },
];
