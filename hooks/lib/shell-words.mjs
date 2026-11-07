// shell-words.mjs — a small, conservative shell command splitter shared by the blocking hooks
// (block-env-write, block-destructive-rm, block-force-push). Plain ESM, node: built-ins only.
//
// parse(src) -> { cmds: [{ name, args, redirs, via }], incomplete } — every simple command found in `src`:
//   * split on ; & && || | |& ( ) and newlines; quotes ('..', "..", $'..'), backslash escapes and `# comments` are
//     honoured; heredoc bodies are skipped (data), arithmetic ($((..)), $[..], ((..)), `let`) is not a heredoc
//   * leading VAR=x assignments, shell keywords (do/then/{/function f ...) and wrappers (sudo, env [-S], command,
//     nice, timeout, chroot, strace, taskset, coproc, ...) are stripped, so `name` is the real program (basename,
//     lower-cased: `\rm`, `/bin/rm`, `"rm"`, `sudo -u x rm` -> `rm`)
//   * `bash -c` / `sh -c` / `su -c` / `script -c` / `flock -c` / `watch` / `eval` / a heredoc or here-string fed
//     to a shell, and `$(...)` / backtick bodies are parsed recursively; `xargs <cmd>` yields <cmd> (via 'xargs')
//   * unquoted words are brace-expanded ({a,b}, {1..3}); empty $() / `` and $@ / $* vanish from a word
//   * redirs: [{ op, target, targets }] (op is >, >>, >|, &>, >&, <>, <, <<, <<<, ...)
//   * incomplete: '' or the reason the text could not be fully modelled (unterminated quote / paren / heredoc,
//     nesting deeper than MAX_DEPTH, too many wrappers, brace expansion too large). Callers fail closed on it.
// Not modelled: variable indirection, command-substitution output, aliases, scripts run from files.
import { braceExpand } from './shell-glob.mjs';
import { ansiC, closeBracket, closeParen, skipBq } from './shell-scan.mjs';

const MAX_DEPTH = 6;
const MAX_WRAPPERS = 12;
const SEP = { t: 'sep' };
// python str.split() whitespace minus \n (a command separator here); built from code points on purpose
const WS_CODES = new Set([0x20, 0x09, 0x0b, 0x0c, 0x0d, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000]);
const isWs = (c) => {
  const n = c.charCodeAt(0);
  return WS_CODES.has(n) || (n >= 0x1c && n <= 0x1f) || (n >= 0x2000 && n <= 0x200a);
};
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=/;
const KEYWORDS = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', 'time']);
const ARITH_AFTER = new Set([...KEYWORDS, 'for']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'ash', 'mksh', 'fish']);

// wrapper -> v: short options that take a value, lv: long options that take a separate value,
// pos: positional args to skip before the command, assign: NAME=value words are skipped (env)
const WRAPPERS = {
  busybox: {},
  toybox: {},
  sudo: { v: 'ughpCrtUDRT', lv: ['user', 'group', 'host', 'prompt', 'chdir', 'role', 'type', 'other-user', 'close-from', 'command-timeout', 'chroot'] },
  doas: { v: 'uC' },
  command: {},
  builtin: {},
  exec: { v: 'a' },
  nohup: {},
  setsid: {},
  nice: { v: 'n', lv: ['adjustment'] },
  ionice: { v: 'cnpt' },
  stdbuf: { v: 'ioe' },
  env: { v: 'uCS', lv: ['unset', 'chdir', 'split-string'], assign: true },
  timeout: { v: 'sk', lv: ['signal', 'kill-after'], pos: 1 },
  chroot: { lv: ['userspec', 'groups'], pos: 1 },
  strace: { v: 'abeEIoOpPsSuUX' },
  ltrace: { v: 'aenoOpsSuXxAFlL' },
  taskset: { pos: 1 },
  coproc: {},
  caffeinate: { v: 'tw' },
};
const XARGS_VAL = 'InPLdEsa';
const XARGS_LONG = ['arg-file', 'delimiter', 'max-args', 'max-lines', 'max-procs', 'max-chars', 'eof', 'process-slot-var'];

/** program name used for matching: basename, lower-cased (macOS file systems are case-insensitive) */
export const progName = (w) => w.replace(/\/+$/, '').split('/').pop().toLowerCase();

function tokenize(src, subs, st) {
  const out = [];
  const n = src.length;
  let word = null;
  let first = null; // first word of the current simple command (for `let`)
  let hereTok = null; // a `<<` token waiting for its delimiter word
  const pending = []; // heredocs whose body starts after the next newline
  const add = (s) => {
    word ??= { v: '', q: false };
    word.v += s;
  };
  const addQ = (s) => {
    add(s);
    word.q = true;
  };
  const sep = () => {
    out.push(SEP);
    first = null;
  };
  const flush = () => {
    if (!word) return;
    const t = { t: 'w', v: word.v, q: word.q };
    out.push(t);
    first ??= t.v;
    if (hereTok) {
      pending.push({ tok: hereTok, delim: t.v });
      hereTok = null;
    }
    word = null;
  };
  const fail = (why) => {
    st.incomplete ||= why;
  };
  /** `$(...)`, `$((...))`, `$[...]`, `` `...` `` starting at i (a word part): returns the index after it */
  const substitution = (i, sink) => {
    if (src[i] === '`') {
      const j = skipBq(src, i);
      if (j < 0) return fail('unterminated backtick'), n;
      const body = src.slice(i + 1, j);
      if (body.trim()) subs.push(body), sink(src.slice(i, j + 1));
      return j + 1;
    }
    if (src[i + 1] === '[') {
      const j = closeBracket(src, i + 1);
      if (j < 0) return fail('unterminated $['), n;
      if (/\$\(|`/.test(src.slice(i, j))) fail('command substitution inside arithmetic');
      sink(src.slice(i, j + 1));
      return j + 1;
    }
    const j = closeParen(src, i + 1);
    if (j < 0) return fail('unterminated $('), n;
    if (src[i + 2] === '(' && src[j - 1] === ')') {
      if (/\$\(|`/.test(src.slice(i + 3, j - 1))) fail('command substitution inside arithmetic');
    } else {
      const body = src.slice(i + 2, j);
      if (!body.trim()) return j + 1; // empty $() expands to nothing
      subs.push(body);
    }
    sink(src.slice(i, j + 1));
    return j + 1;
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] === '\n') i += 2; // line continuation
      else if (i + 1 < n) {
        addQ(src[i + 1]);
        i += 2;
      } else i++;
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) fail("unterminated '");
      const e = j < 0 ? n : j;
      addQ(src.slice(i + 1, e));
      i = e + 1;
    } else if (c === '"') {
      let s = '';
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n && '$`"\\\n'.includes(src[i + 1])) {
          if (src[i + 1] !== '\n') s += src[i + 1];
          i += 2;
        } else if (src[i] === '$' && (src[i + 1] === '@' || src[i + 1] === '*')) i += 2;
        else if ((src[i] === '$' && (src[i + 1] === '(' || src[i + 1] === '[')) || src[i] === '`') {
          i = substitution(i, (x) => (s += x));
        } else s += src[i++];
      }
      if (i >= n) fail('unterminated "');
      i++;
      addQ(s);
    } else if (c === '$' && src[i + 1] === "'") {
      const [s, j, closed] = ansiC(src, i + 2);
      if (!closed) fail("unterminated $'");
      addQ(s);
      i = j;
    } else if (c === '$' && src[i + 1] === '"') {
      i++; // $"..." is a plain double-quoted string for our purposes
    } else if (c === '$' && (src[i + 1] === '@' || src[i + 1] === '*')) {
      i += 2; // no positional parameters in a hook-checked command
    } else if ((c === '$' && (src[i + 1] === '(' || src[i + 1] === '[')) || c === '`') {
      i = substitution(i, add); // stays part of the current word: `rm -rf $(x) /` keeps / as an rm argument
    } else if (c === '#' && !word) {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '\n') {
      flush();
      sep();
      i++;
      while (pending.length) {
        const { tok, delim } = pending.shift();
        const lines = [];
        let closed = false;
        while (i < n) {
          let e = src.indexOf('\n', i);
          if (e < 0) e = n;
          const line = src.slice(i, e).replace(/\r$/, '');
          i = Math.min(e + 1, n);
          if (line === delim || line.replace(/^\t+/, '') === delim) {
            closed = true;
            break;
          }
          lines.push(line);
        }
        if (!closed) fail('unterminated heredoc');
        tok.body = lines.join('\n');
      }
    } else if (isWs(c)) {
      flush();
      i++;
    } else if (c === '(' && src[i + 1] === '(' && !word && (out.length === 0 || out[out.length - 1] === SEP || ARITH_AFTER.has(out[out.length - 1].v))) {
      // arithmetic command (( ... )) / for (( ... )): `<<` in it is a shift, not a heredoc. bash re-reads a
      // (( that is not valid arithmetic as nested subshells, so its body is also parsed as commands.
      const j = closeParen(src, i);
      if (j < 0) return fail('unterminated (('), out;
      if (/\$\(|`/.test(src.slice(i, j))) fail('command substitution inside arithmetic');
      subs.push(src.slice(i + 2, j - 1).replaceAll('<<', ' '));
      sep();
      i = j + 1;
    } else if (c === ';' || c === '(' || c === ')') {
      flush();
      sep();
      i++;
    } else if (c === '&' && src[i + 1] === '>') {
      flush();
      const op = src[i + 2] === '>' ? '&>>' : '&>';
      out.push({ t: 'r', op });
      i += op.length;
    } else if (c === '|' || c === '&') {
      flush();
      sep();
      i += src[i + 1] === c || (c === '|' && src[i + 1] === '&') ? 2 : 1;
    } else if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<' && first === 'let') {
      add('<<'); // `let x=1<<2`: a shift, not a heredoc
      i += 2;
    } else if (c === '>' || c === '<') {
      if (word && !word.q && /^\d+$/.test(word.v)) word = null; // fd prefix: 2>file
      else flush();
      let op = c;
      i++;
      if (c === '>') {
        if (src[i] === '>' || src[i] === '|' || src[i] === '&') op += src[i++];
      } else if (src[i] === '<') {
        op = '<<';
        i++;
        if (src[i] === '<' || src[i] === '-') op += src[i++];
      } else if (src[i] === '&' || src[i] === '>') op += src[i++];
      const tok = { t: 'r', op };
      out.push(tok);
      if (op === '<<' || op === '<<-') hereTok = tok;
    } else {
      add(c);
      i++;
    }
  }
  flush();
  if (hereTok || pending.length) fail('unterminated heredoc');
  return out;
}

/** unquoted words are brace-expanded like bash does; a quoted word stays one word */
function expandWord(t, st) {
  if (t.q || !t.v.includes('{')) return [t.v];
  const e = braceExpand(t.v);
  if (e) return e;
  st.incomplete ||= 'brace expansion too large';
  return [t.v];
}

function assemble(tokens, st) {
  const cmds = [];
  let cur = { argv: [], redirs: [] };
  let pend = null;
  const end = () => {
    if (cur.argv.length || cur.redirs.length) cmds.push(cur);
    cur = { argv: [], redirs: [] };
    pend = null;
  };
  for (const t of tokens) {
    if (t.t === 'sep') end();
    else if (t.t === 'r') {
      pend = t;
      cur.redirs.push(t);
    } else if (pend) {
      pend.target = t.v;
      pend.targets = expandWord(t, st);
      pend = null;
    } else cur.argv.push(...expandWord(t, st));
  }
  end();
  return cmds;
}

/** index of the first non-option word of `a` from `i`, skipping options (and their values) of a wrapper-like program */
function skipOptions(a, i, shortVal = '', longVal = [], assign = false) {
  for (; i < a.length; i++) {
    const x = a[i];
    if (x === '--') return i + 1;
    if (assign && ASSIGN.test(x)) continue;
    if (x.startsWith('--')) {
      if (!x.includes('=') && longVal.includes(x.slice(2))) i++;
    } else if (x.length > 1 && x[0] === '-') {
      const k = [...x.slice(1)].findIndex((ch) => shortVal.includes(ch));
      if (k >= 0 && k === x.length - 2) i++;
    } else break;
  }
  return i;
}

/** the words of a string, the way `env -S` splits it (quotes honoured, no expansion) */
function splitWords(s) {
  return tokenize(s, [], { incomplete: '' })
    .filter((t) => t.t === 'w')
    .map((t) => t.v);
}

/** `env ... -S 'str' rest` -> the argv env runs, or null when there is no -S */
function envSplit(a, i) {
  for (let k = i + 1; k < a.length; k++) {
    const x = a[k];
    if (x === '--' || (!x.startsWith('-') && !ASSIGN.test(x))) return null;
    let v = null;
    let next = k + 1;
    if (x === '-S' || x === '--split-string') (v = a[k + 1] ?? ''), (next = k + 2);
    else if (x.startsWith('--split-string=')) v = x.slice(15);
    else if (/^-[^-]*S/.test(x)) {
      const rest = x.slice(x.indexOf('S') + 1);
      if (rest) v = rest;
      else (v = a[k + 1] ?? ''), (next = k + 2);
    }
    if (v !== null) return [...splitWords(v), ...a.slice(next)];
    if (/^-[uC]$/.test(x) || x === '--unset' || x === '--chdir') k++;
  }
  return null;
}

/** strip keywords, assignments and wrappers; returns the argv of the real program */
function unwrap(argv, st) {
  let a = argv;
  let i = 0;
  for (let n = 0; ; n++) {
    while (i < a.length && (KEYWORDS.has(a[i]) || ASSIGN.test(a[i]))) i++;
    if (i >= a.length) return [];
    const p = progName(a[i]);
    if (p === 'function') {
      i += 2; // function NAME [()] { ... }: the body is split off at ( ) ; and { is a keyword
      continue;
    }
    const w = WRAPPERS[p];
    if (!w) return a.slice(i);
    if (n >= MAX_WRAPPERS) {
      st.incomplete ||= 'too many wrappers';
      return a.slice(i);
    }
    if (p === 'env') {
      const split = envSplit(a, i);
      if (split) {
        a = split;
        i = 0;
        continue;
      }
    }
    if (p === 'coproc' && a[i + 2] === '{') i++; // coproc NAME { ... }
    i = skipOptions(a, i + 1, w.v, w.lv, w.assign) + (w.pos ?? 0);
  }
}

/** the script of `sh -c <script>`, or null when the shell is not given one */
function shellScript(args) {
  let c = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') return c ? (args[i + 1] ?? null) : null;
    if (a.startsWith('--')) continue;
    if (a.length > 1 && (a[0] === '-' || a[0] === '+')) {
      if (a[0] === '-' && a.includes('c')) c = true;
      if (/[oO]$/.test(a)) i++;
    } else return c ? a : null;
  }
  return null;
}

/** value of -c / --command for su, runuser, script, flock */
function optCommand(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-c' || a === '--command') return args[i + 1] ?? '';
    if (a.startsWith('--command=')) return a.slice(10);
    if (/^-[^-]*c$/.test(a)) return args[i + 1] ?? '';
  }
  return null;
}

function pushCommand(out, argv, redirs, depth, via, st) {
  argv = unwrap(argv, st);
  if (!argv.length) {
    if (redirs.length) out.push({ name: '', args: [], redirs, via });
    return;
  }
  const name = progName(argv[0]);
  const args = argv.slice(1);
  out.push({ name, args, redirs, via });
  const sub = (script) => {
    if (depth >= MAX_DEPTH) st.incomplete ||= 'nesting too deep';
    else out.push(...walk(script, depth + 1, st));
  };
  if (SHELLS.has(name)) {
    const script = shellScript(args);
    if (script !== null) sub(script);
    else for (const r of redirs) if (r.body !== undefined || r.op === '<<<') sub(r.body ?? r.target ?? '');
  } else if (name === 'eval') sub(args.join(' '));
  else if (name === 'su' || name === 'runuser' || name === 'script') {
    const script = optCommand(args);
    if (script !== null) sub(script);
  } else if (name === 'flock') {
    const script = optCommand(args);
    if (script !== null) sub(script);
    else {
      let k = skipOptions(args, 0, 'wE', ['timeout', 'conflict-exit-code']) + 1; // lock file
      k = skipOptions(args, k, 'wE', ['timeout', 'conflict-exit-code']);
      if (k < args.length && depth < MAX_DEPTH) pushCommand(out, args.slice(k), [], depth + 1, via, st);
    }
  } else if (name === 'watch') {
    const k = skipOptions(args, 0, 'nqd', ['interval']);
    if (k < args.length) sub(args.slice(k).join(' ')); // watch hands its arguments to sh -c
  } else if (name === 'xargs') {
    const inner = args.slice(skipOptions(args, 0, XARGS_VAL, XARGS_LONG));
    if (!inner.length) return;
    if (depth >= MAX_DEPTH) st.incomplete ||= 'nesting too deep';
    else pushCommand(out, inner, [], depth + 1, 'xargs', st);
  }
}

function walk(src, depth, st) {
  const out = [];
  const subs = [];
  for (const c of assemble(tokenize(src, subs, st), st)) pushCommand(out, c.argv, c.redirs, depth, undefined, st);
  for (const s of subs) {
    if (depth >= MAX_DEPTH) st.incomplete ||= 'nesting too deep';
    else out.push(...walk(s, depth + 1, st));
  }
  return out;
}

export function parse(src) {
  const st = { incomplete: '' };
  const cmds = walk(src, 0, st);
  return { cmds, incomplete: st.incomplete };
}

export const commands = (src) => parse(src).cmds;
