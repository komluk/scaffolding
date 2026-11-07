// guards.mjs — decisions of the blocking Bash/Edit/Write hooks (block-env-write, block-destructive-rm,
// block-force-push). Each guard returns the BLOCKED message, or '' to allow. Commands are split with
// shell-words.mjs (quoting, wrappers, `bash -c`, `$(...)`, xargs, every line). When the splitter cannot model
// the text completely, or it is over 256 KB, a guard falls back to a conservative regex and fails CLOSED.
// Plain ESM, node: built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { braceExpand, globCouldName, globMatches, hasGlob } from './shell-glob.mjs';
import { parse, progName } from './shell-words.mjs';

const P = path.posix;
const CAP = 256 * 1024;
const trimSlash = (w) => (/^\/+$/.test(w) ? '/' : w.replace(/\/+$/, ''));
const base = (w) => P.basename(trimSlash(w));
const expand = (w) => (w.includes('{') ? (braceExpand(w) ?? [w]) : [w]);
/** is the program `name` (possibly a glob like r? or r[m]) the program `want`? */
const isProg = (name, want) => name === want || (hasGlob(name) && globMatches(name, want));

function parsed(cmd) {
  if (Buffer.byteLength(cmd) > CAP) return { cmds: [], incomplete: 'command over 256 KB' };
  return parse(cmd);
}
const unparsed = (why, what) =>
  `BLOCKED: this command could not be parsed safely (${why}) and mentions ${what}. Split it into simpler commands.`;

/** values of the wanted options; `val` = short options taking a value, `lval` = long options taking a separate one */
function optValues(args, val, lval, wantShort, wantLong) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') break;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq < 0 ? a.slice(2) : a.slice(2, eq);
      let v = eq < 0 ? null : a.slice(eq + 1);
      if (v === null && (lval.includes(k) || wantLong.includes(k))) v = args[++i] ?? '';
      if (wantLong.includes(k) && v !== null) out.push(v);
    } else if (a.length > 1 && a[0] === '-') {
      for (let k = 1; k < a.length; k++) {
        if (!val.includes(a[k]) && !wantShort.includes(a[k])) continue;
        const v = k + 1 < a.length ? a.slice(k + 1) : (args[++i] ?? '');
        if (wantShort.includes(a[k])) out.push(v);
        break;
      }
    }
  }
  return out;
}

/** positional args, skipping options; `val` = short options that take a value, `lval` = long ones */
function positionals(args, val = '', lval = []) {
  const out = [];
  const opts = new Map();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      out.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const [k, v] = a.split(/=(.*)/s);
      if (v === undefined && lval.includes(k.slice(2))) opts.set(k, args[++i] ?? '');
      else opts.set(k, v ?? '');
    } else if (a.length > 1 && a[0] === '-') {
      for (let k = 1; k < a.length; k++) {
        if (!val.includes(a[k])) {
          opts.set(`-${a[k]}`, '');
          continue;
        }
        opts.set(`-${a[k]}`, k + 1 < a.length ? a.slice(k + 1) : (args[++i] ?? ''));
        break;
      }
    } else out.push(a);
  }
  return { pos: out, opts };
}

// ------------------------------------------------------------------ block-env-write
/** `.env` or `.env.<anything>`, case-insensitive (macOS/Windows file systems are) */
export const isEnvName = (name) => {
  const n = name.toLowerCase();
  return n === '.env' || n.startsWith('.env.');
};
const isEnvPath = (w) => isEnvName(base(w));
/** a shell word: brace-expanded, and a glob basename blocks when it could name .env / .env.* */
const isEnvWord = (w) =>
  expand(w).some((x) => {
    const b = base(x);
    return hasGlob(b) ? globCouldName(b, '.env', '.env.') : isEnvName(b);
  });
const ENV_MSG = 'Environment files must be edited manually.';
const ENV_DANGER = /env|\.[e*?[{]/i;

/** sed / perl: the files edited in place (the script is not a file); [] without an in-place flag */
function inPlaceFiles(name, args) {
  const takesVal = name === 'sed' ? 'efl' : 'eE';
  const restVal = name === 'sed' ? '' : 'FMmIxCdD';
  let inPlace = false;
  let script = false;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      files.push(...args.slice(i + 1));
      break;
    }
    if (name === 'sed' && a.startsWith('--')) {
      if (a.startsWith('--in-place')) inPlace = true;
      else if (a === '--expression' || a === '--file') (script = true), i++;
      else if (a.startsWith('--expression=') || a.startsWith('--file=')) script = true;
      continue;
    }
    if (a.length > 1 && a[0] === '-' && a[1] !== '-') {
      for (let k = 1; k < a.length; k++) {
        const c = a[k];
        if (c === 'i') {
          inPlace = true;
          break; // the rest is the backup suffix
        }
        if (takesVal.includes(c)) {
          script = true;
          if (k === a.length - 1) i++;
          break;
        }
        if (restVal.includes(c)) break;
      }
      continue;
    }
    if (!script) script = true; // first positional is the script
    else files.push(a);
  }
  return inPlace ? files : [];
}

/** `cp` / `mv` / `install` / `ln`: the paths that get written */
function copyDests(name, args) {
  const val = name === 'install' ? 'mogtS' : 'tS';
  const { pos, opts } = positionals(args, val, ['target-directory', 'suffix', 'mode', 'owner', 'group']);
  if (name === 'install' && (opts.has('-d') || opts.has('--directory'))) return [];
  const tdir = opts.get('-t') ?? opts.get('--target-directory');
  if (tdir !== undefined) return pos.map((s) => P.join(tdir, base(s)));
  if (pos.length < 2) return [];
  const dest = pos[pos.length - 1];
  const intoDir = pos.length > 2 || dest.endsWith('/') || base(dest) === '.' || base(dest) === '..';
  return intoDir ? pos.slice(0, -1).map((s) => P.join(dest, base(s))) : [dest];
}

/** files a command writes, other than through redirects */
function writtenFiles(c) {
  const n = c.name;
  if (n === 'tee') return positionals(c.args).pos;
  if (n === 'cp' || n === 'mv' || n === 'install' || n === 'ln') return copyDests(n, c.args);
  if (n === 'sed' || n === 'perl') return inPlaceFiles(n, c.args);
  if (n === 'truncate') return positionals(c.args, 'sr', ['size', 'reference']).pos;
  if (n === 'curl') return optValues(c.args, 'AbcCdDeEFHKmoPQrTtuUwxXyYz', [], 'oDc', ['output', 'dump-header', 'cookie-jar']);
  if (n === 'wget') return optValues(c.args, 'oOaAeiPQlRtTwUBDIXhH', [], 'oOa', ['output-document', 'output-file', 'append-output']);
  if (n === 'dd') return c.args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3));
  return [];
}

const WRITE_REDIRS = new Set(['>', '>>', '>|', '&>', '&>>', '>&', '<>']);

export function envWriteGuard(filePath, cmd) {
  // the real basename, and (conservatively, as the line-based hook did) the basename of each line
  const hit = filePath ? [filePath, ...filePath.split('\n')].find((p) => p && isEnvPath(p)) : undefined;
  if (hit !== undefined) return `BLOCKED: Writing to ${base(hit)} is not allowed. ${ENV_MSG}`;
  if (!cmd) return '';
  const { cmds, incomplete } = parsed(cmd);
  for (const c of cmds) {
    const redir = c.redirs.some(
      (r) => WRITE_REDIRS.has(r.op) && r.target !== undefined && !/^\d+$/.test(r.target) && (r.targets ?? [r.target]).some(isEnvWord),
    );
    if (redir || (c.name === 'tee' && writtenFiles(c).some(isEnvWord))) {
      return `BLOCKED: Writing to .env via shell redirect/tee is not allowed. ${ENV_MSG}`;
    }
    const d = writtenFiles(c).find(isEnvWord);
    if (d !== undefined) return `BLOCKED: Writing to ${base(d)} via ${c.name} is not allowed. ${ENV_MSG}`;
  }
  if (incomplete && ENV_DANGER.test(cmd)) return unparsed(incomplete, '.env');
  return '';
}

// ------------------------------------------------------------------ block-destructive-rm
const SUBTREE = ['/etc', '/var', '/usr', '/System', '/private/etc', '/private/var'];
const EXACT = new Set(['/', '/home', '/root', '/boot', '/opt', '/srv', '/bin', '/sbin', '/Users', '/Applications', '/Library', '/private']);
// below these, deleting is routine (temp dirs, locally installed software)
const ALLOWED_BELOW = ['/var/folders', '/private/var/folders', '/var/tmp', '/usr/local'];
const HOME_KEEP = new Set(['.ssh', '.gnupg', '.config', '.local', '.claude']);
const HOME_RE = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/;
const RM_DANGER = /(^|[^a-z0-9_])(rm|unlink|shred)([^a-z0-9_]|$)|-delete/i;

/** expand ~, ~user, $HOME, ${HOME} at the start of a word (the only expansion a pattern hook can do) */
function expandHome(w, home) {
  if (HOME_RE.test(w)) return (home || '/nonexistent-home') + w.replace(HOME_RE, '');
  const m = /^~([^/]+)(.*)$/s.exec(w);
  if (m) return (m[1] === 'root' ? '/root' : `/home/${m[1]}`) + m[2];
  return w;
}

/** top-level dir of the git repo containing `dir` (nearest ancestor with a .git entry), or '' */
function repoRoot(dir) {
  for (let d = dir; ; d = P.dirname(d)) {
    try {
      if (fs.existsSync(P.join(d, '.git'))) return d;
    } catch {
      return '';
    }
    if (d === '/') return '';
  }
}

/** context for one rm/find decision: home, cwd and the repo top level (lazy) */
export function rmContext(home, cwd) {
  const c = { home: home ? P.resolve('/', home) : '', cwd: cwd && cwd.startsWith('/') ? P.resolve(cwd) : '/' };
  let root;
  c.root = () => (root ??= repoRoot(c.cwd));
  return c;
}

function protectedAbs(n, ctx) {
  if (P.basename(n) === '.git' && ctx.root() && P.dirname(n) === ctx.root()) return true;
  if (ALLOWED_BELOW.some((b) => n.startsWith(`${b}/`))) return false;
  if (EXACT.has(n) || /^\/lib[^/]*$/.test(n)) return true;
  if (SUBTREE.some((b) => n === b || n.startsWith(`${b}/`))) return true;
  const h = ctx.home;
  return Boolean(h && h !== '/' && (n === h || (P.dirname(n) === h && HOME_KEEP.has(P.basename(n)))));
}

/** is this rm/find target protected? `relative` = also apply the `.` / `..` / `.git` word rules (rm yes, find no) */
export function protectedTarget(word, ctx, relative = true) {
  return expand(word).some((x) => protectedOne(x, ctx, relative));
}

function protectedOne(word, ctx, relative) {
  const w = expandHome(word, ctx.home);
  if (w === '') return false;
  const abs = P.resolve(ctx.cwd, w);
  if (hasGlob(w)) {
    // a glob: protected when the directory it expands in is, or when its last part can name .git there
    const segs = (w.startsWith('/') ? w : `${ctx.cwd}/${w}`).split('/');
    const g = segs.findIndex((s) => hasGlob(s));
    const parent = P.resolve('/', segs.slice(0, g).join('/') || '/');
    if (protectedAbs(parent, ctx)) return true;
    const last = segs.slice(g).filter(Boolean);
    return last.length === 1 && globMatches(last[0], '.git') && (parent === ctx.root() || parent === ctx.cwd);
  }
  if (relative && !w.startsWith('/')) {
    const n = trimSlash(P.normalize(w));
    if (n === '.' || /^\.\.(\/\.\.)*$/.test(n) || n === '.git') return true;
  }
  return protectedAbs(abs, ctx);
}

function rmRecursive(args) {
  const targets = [];
  let rec = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      targets.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      if (a.length >= 3 && '--recursive'.startsWith(a)) rec = true; // getopt accepts any unique prefix: --rec
    } else if (a.length > 1 && a[0] === '-') {
      if (/[rR]/.test(a)) rec = true;
    } else targets.push(a);
  }
  return { rec, targets };
}

const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir']);

/** find's start paths: after -H -L -P -D <debugopts> -O<n>, up to the first expression word */
function findPaths(args) {
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '-H' || a === '-L' || a === '-P' || /^-O\d*$/.test(a)) i++;
    else if (a === '-D') i += 2;
    else break;
  }
  const out = [];
  for (; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-') || a === '(' || a === '!' || a === ',') break;
    out.push(a);
  }
  return out.length ? out : ['.'];
}

export function rmGuard(cmd, home, cwd) {
  if (!cmd) return '';
  const ctx = rmContext(home, cwd);
  const { cmds, incomplete } = parsed(cmd);
  for (const c of cmds) {
    if (isProg(c.name, 'rm')) {
      if (c.via === 'xargs') return 'BLOCKED: Piping to rm via xargs is not allowed.';
      const { rec, targets } = rmRecursive(c.args);
      if (!rec) continue;
      const t = targets.find((x) => protectedTarget(x, ctx));
      if (t !== undefined) return `BLOCKED: Destructive rm -rf on '${t}' is not allowed.`;
    } else if (isProg(c.name, 'find')) {
      const deletes = c.args.some((a, i) => a === '-delete' || (FIND_EXEC.has(a) && progName(c.args[i + 1] ?? '') === 'rm'));
      if (!deletes) continue;
      const t = findPaths(c.args).find((x) => protectedTarget(x, ctx, false));
      if (t !== undefined) return `BLOCKED: Destructive find on '${t}' is not allowed.`;
    }
  }
  if (incomplete && RM_DANGER.test(cmd)) return unparsed(incomplete, 'rm / unlink / shred / -delete');
  return '';
}

// ------------------------------------------------------------------ block-force-push
const GIT_VAL = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']);
const PUSH_LVAL = new Set(['--repo', '--receive-pack', '--exec', '--push-option']);
const PROTECTED_BRANCH = (r) => ['main', 'master'].includes(r.replace(/^refs\/heads\//, ''));
// config that turns another command into a push, or rewrites what a push does
const BAD_CONFIG = /^(alias\.|remote\..*\.(push|mirror)=|help\.autocorrect=)/i;
const PUSH_DANGER = /push|alias\.|autocorrect/i;
const FORCE_OPTS = ['--force', '--force-with-lease', '--force-if-includes'];
/** long option `k` (no =value) names `full`: exact, or an abbreviation of at least `min` chars (git accepts those) */
const abbrev = (k, full, min) => k === full || (k.length >= min && full.startsWith(k));

/** the -c / --config-env values of a git argv, and the args after the `push` subcommand (null if not a push) */
function gitArgs(args) {
  const config = [];
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '-c') config.push(args[++i] ?? '');
    else if (a === '--config-env') config.push(`${args[++i] ?? ''}=`);
    else if (a.startsWith('--config-env=')) config.push(`${a.slice(13)}=`);
    else if (GIT_VAL.has(a)) i++;
    else if (!a.startsWith('-')) break;
  }
  return { config, push: args[i] === 'push' ? args.slice(i + 1) : null };
}

export function pushGuard(cmd) {
  if (!cmd) return '';
  const { cmds, incomplete } = parsed(cmd);
  for (const c of cmds) {
    if (!isProg(c.name, 'git')) continue;
    const { config, push: args } = gitArgs(c.args);
    const bad = config.find((v) => BAD_CONFIG.test(v));
    if (bad !== undefined) return `BLOCKED: git -c '${bad.replace(/=$/, '')}' is not allowed (it can turn a command into a force push).`;
    if (!args) continue;
    let longForce = false;
    let shortForce = false;
    let mirror = false;
    let del = false;
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--') {
        pos.push(...args.slice(i + 1));
        break;
      }
      if (a.startsWith('--')) {
        const k = a.split('=')[0];
        if (k.startsWith('--force-') || FORCE_OPTS.some((f) => abbrev(k, f, 5))) longForce = true;
        else if (abbrev(k, '--mirror', 4)) mirror = true;
        else if (abbrev(k, '--delete', 4)) del = true;
        else if (PUSH_LVAL.has(k) && !a.includes('=')) i++;
      } else if (a.length > 1 && a[0] === '-') {
        for (let k = 1; k < a.length; k++) {
          if (a[k] === 'f') shortForce = true;
          else if (a[k] === 'd') del = true;
          else if (a[k] === 'o') {
            if (k === a.length - 1) i++;
            break;
          }
        }
      } else pos.push(a);
    }
    if (longForce) return 'BLOCKED: Force push is not allowed. Remove --force or --force-with-lease flag.';
    if (shortForce) return 'BLOCKED: Force push (-f) is not allowed.';
    if (mirror) return 'BLOCKED: git push --mirror is not allowed (it force-updates and deletes remote refs).';
    const plus = pos.find((r) => r.startsWith('+'));
    if (plus !== undefined) return `BLOCKED: Force push via the '+' refspec '${plus}' is not allowed.`;
    const refs = pos.slice(1);
    const gone = del ? refs.find(PROTECTED_BRANCH) : refs.find((r) => r.startsWith(':') && PROTECTED_BRANCH(r.slice(1)));
    if (gone !== undefined) return `BLOCKED: Deleting '${gone.replace(/^:/, '')}' on the remote is not allowed.`;
  }
  if (incomplete && PUSH_DANGER.test(cmd)) return unparsed(incomplete, 'git push');
  return '';
}
