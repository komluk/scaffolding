import { BAD_INPUTS, j } from './_util.mjs';

const REPO = ['git init -q repo', 'git -C repo commit -q --allow-empty -m init'];
const CONV = ['mkdir -p share/conv repo/.scaffolding', 'ln -s "$SANDBOX/share/conv" repo/.scaffolding/conversations'];
const stateCreate = [
  'git -C repo worktree list --porcelain 2>/dev/null | grep -E "^(worktree|branch)"',
  'echo "--"; ls -A repo/.scaffolding 2>&1; ls -A repo/.scaffolding/worktrees 2>&1',
  'for d in repo/.scaffolding/worktrees/*; do [ -e "$d" ] && { echo "$d:"; ls -A "$d/.scaffolding" 2>&1; readlink "$d/.scaffolding/conversations"; }; done; true',
];
const create = (name, stdin, setup = REPO, extra = {}) => ({ name, stdin, setup, after: stateCreate, ...extra });
const wt = (name) => `git -C repo worktree add -q -b ${name} "$SANDBOX/repo/.scaffolding/worktrees/${name}" HEAD`;
const stateRemove = ['git -C repo worktree list --porcelain 2>/dev/null | grep -E "^worktree"', 'echo "--"; ls -A repo/.scaffolding/worktrees 2>&1; ls -A share/conv 2>&1; git -C repo branch --list | sed "s/^[* ]*//"'];
const remove = (name, stdin, setup = [...REPO, ...CONV, wt('w1')], extra = {}) => ({ name, stdin, setup, after: stateRemove, ...extra });
const R = '@SANDBOX@/repo';

export default [
  {
    hook: 'worktree-create.sh',
    cases: [
      ...BAD_INPUTS.map(([name, f]) => ({ name: `bad input: ${name}`, setup: REPO, after: stateCreate, ...f })),
      create('creates worktree with name', j({ cwd: R, name: 'feat' })),
      create('slash in name -> plus', j({ cwd: R, name: 'feat/x/y' })),
      create('name missing -> worktree', j({ cwd: R })),
      create('name empty string', j({ cwd: R, name: '' })),
      create('name null -> None', j({ cwd: R, name: null })),
      create('name number', j({ cwd: R, name: 7 })),
      create('name float', j({ cwd: R, name: 1.5 })),
      create('name true', j({ cwd: R, name: true })),
      create('name list', j({ cwd: R, name: ['a'] })),
      create('name with spaces', j({ cwd: R, name: 'my feature' })),
      create('name unicode', j({ cwd: R, name: 'zażółć' })),
      create('name with trailing newline', j({ cwd: R, name: 'nl\n' })),
      create('name with embedded newline', j({ cwd: R, name: 'a\nb' })),
      create('name with dots', j({ cwd: R, name: '..' })),
      create('name invalid for git ref', j({ cwd: R, name: 'a b~c' })),
      create('cwd missing', j({ name: 'x' })),
      create('cwd empty string', j({ cwd: '', name: 'x' })),
      create('cwd null -> None (not a repo, echoed)', j({ cwd: null, name: 'x' })),
      create('cwd number', j({ cwd: 5, name: 'x' })),
      create('cwd list', j({ cwd: ['a'], name: 'x' })),
      create('cwd not a git repo: echoed back', j({ cwd: '@SANDBOX@', name: 'x' }), []),
      create('cwd nonexistent: echoed back', j({ cwd: '@SANDBOX@/nope', name: 'x' }), []),
      create('cwd subdir of repo', j({ cwd: `${R}/sub`, name: 'x' }), [...REPO, 'mkdir repo/sub']),
      create('cwd with spaces', j({ cwd: '@SANDBOX@/my repo', name: 'x' }), ['git init -q "my repo"', 'git -C "my repo" commit -q --allow-empty -m init']),
      create('cwd with trailing newline', j({ cwd: `${R}\n`, name: 'x' })),
      create('resume existing worktree', j({ cwd: R, name: 'w1' }), [...REPO, 'mkdir -p repo/.scaffolding/worktrees/w1']),
      create('conversations symlink propagated', j({ cwd: R, name: 'feat' }), [...REPO, ...CONV]),
      create('conversations is a real dir: no link', j({ cwd: R, name: 'feat' }), [...REPO, 'mkdir -p repo/.scaffolding/conversations']),
      create('conversations symlink dangling', j({ cwd: R, name: 'feat' }), [...REPO, 'mkdir -p repo/.scaffolding', 'ln -s /nonexistent/zzz repo/.scaffolding/conversations']),
      create('repo without commits fails', j({ cwd: R, name: 'x' }), ['git init -q repo']),
      create('extra fields ignored', j({ cwd: R, name: 'feat', session_id: 's', hook_event_name: 'WorktreeCreate' })),
      create('stdin has trailing newline', `${j({ cwd: R, name: 'feat' })}\n`),
      { name: 'invalid utf-8 in unrelated field: python strict stdin fails', stdin_b64: Buffer.from('{"x":"\xff","cwd":"@SANDBOX@/repo","name":"n"}', 'latin1').toString('base64'), setup: REPO, after: stateCreate },
    ],
  },
  {
    hook: 'worktree-remove.sh',
    cases: [
      ...BAD_INPUTS.map(([name, f]) => ({ name: `bad input: ${name}`, setup: [...REPO, ...CONV, wt('w1')], after: stateRemove, ...f })),
      remove('removes registered worktree', j({ worktree_path: `${R}/.scaffolding/worktrees/w1` })),
      remove('removes and drops conversations link, share intact', j({ worktree_path: `${R}/.scaffolding/worktrees/w1` }), [...REPO, ...CONV, 'echo keep > share/conv/f.md', wt('w1'), 'ln -s "$SANDBOX/share/conv" repo/.scaffolding/worktrees/w1/.scaffolding/conversations 2>/dev/null || { mkdir -p repo/.scaffolding/worktrees/w1/.scaffolding; ln -s "$SANDBOX/share/conv" repo/.scaffolding/worktrees/w1/.scaffolding/conversations; }']),
      remove('dirty worktree is force-removed', j({ worktree_path: `${R}/.scaffolding/worktrees/w1` }), [...REPO, ...CONV, wt('w1'), 'echo x > repo/.scaffolding/worktrees/w1/untracked.txt']),
      remove('missing worktree_path', j({})),
      remove('empty worktree_path', j({ worktree_path: '' })),
      remove('null worktree_path -> None', j({ worktree_path: null })),
      remove('number worktree_path', j({ worktree_path: 3 })),
      remove('list worktree_path', j({ worktree_path: ['x'] })),
      remove('nonexistent path', j({ worktree_path: `${R}/.scaffolding/worktrees/zzz` })),
      remove('path exists but not a git worktree', j({ worktree_path: '@SANDBOX@/plain' }), [...REPO, 'mkdir plain']),
      remove('main checkout is refused', j({ worktree_path: R })),
      remove('registered worktree outside .scaffolding/worktrees is refused', j({ worktree_path: '@SANDBOX@/elsewhere' }), [...REPO, 'git -C repo worktree add -q -b other "$SANDBOX/elsewhere" HEAD']),
      remove('dot-dot segment ignored', j({ worktree_path: `${R}/.scaffolding/worktrees/../worktrees/w1` })),
      remove('substring lookalike not removed', j({ worktree_path: `${R}/.scaffolding/worktrees/w1-evil` }), [...REPO, ...CONV, wt('w1'), 'mkdir -p repo/.scaffolding/worktrees/w1-evil']),
      remove('trailing slash is not an exact match', j({ worktree_path: `${R}/.scaffolding/worktrees/w1/` })),
      remove('relative path', j({ worktree_path: 'repo/.scaffolding/worktrees/w1' })),
      remove('path with trailing newline', j({ worktree_path: `${R}/.scaffolding/worktrees/w1\n` })),
      remove('worktree name with spaces', j({ worktree_path: `${R}/.scaffolding/worktrees/w 2` }), [...REPO, ...CONV, 'git -C repo worktree add -q -b w2 "$SANDBOX/repo/.scaffolding/worktrees/w 2" HEAD']),
      remove('unicode worktree path', j({ worktree_path: `${R}/.scaffolding/worktrees/zażółć` }), [...REPO, ...CONV, 'git -C repo worktree add -q -b wz "$SANDBOX/repo/.scaffolding/worktrees/zażółć" HEAD']),
      remove('extra fields ignored', j({ worktree_path: `${R}/.scaffolding/worktrees/w1`, hook_event_name: 'WorktreeRemove', session_id: 's' })),
    ],
  },
];
