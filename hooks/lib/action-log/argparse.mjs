// argparse.mjs — the slice of python's argparse (3.14) that action_log.py's CLI used, ported literally, so that the same
// argv is accepted, abbreviated or rejected: `--opt val`, `--opt=val`, unique prefixes (`--conv`), `-h`, `--`,
// negative-number-looking values, required options, "unrecognized arguments". A usage error prints python's usage and
// message to stderr and throws ExitError(2); `-h` prints the help to stdout and throws ExitError(0).
import { pyStr } from '../hook-io.mjs';
import { USAGE } from './usage.mjs';

export class ExitError extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}
class ArgumentError extends Error {}

const repr = (s) => pyStr([s]).slice(1, -1); // python repr() of a str
const nameOf = (a) => (a.flags ? a.flags.join('/') : a.dest);
const aerr = (a, message) => new ArgumentError(a ? `argument ${nameOf(a)}: ${message}` : message);

const flag = (flags, dest) => ({ flags, dest, nargs: 0, deflt: false });
const value = (flags, dest, extra = {}) => ({ flags, dest, nargs: 1, deflt: null, ...extra });
const HELP = { flags: ['-h', '--help'], dest: 'help', nargs: 0, help: true };
const parser = (key, options, positionals = []) => ({ key, options: [HELP, ...options], positionals });

const SUBPARSERS = {
  platform: parser('platform', [value(['--task-dir'], 'task_dir', { required: true }), value(['--conv-dir'], 'conv_dir', { required: true }), flag(['--force'], 'force'), value(['--agent'], 'agent', { deflt: 'main' })]),
  local: parser('local', [value(['--transcript'], 'transcript', { required: true }), value(['--session-id'], 'session_id', { required: true }), value(['--conv-dir'], 'conv_dir', { required: true }), value(['--project-dir'], 'project_dir'), flag(['--final'], 'final')]),
  render: parser('render', [value(['--conv-dir'], 'conv_dir', { required: true })]),
  backfill: parser('backfill', [], [{ dest: 'root', nargs: 1 }]),
};
const TOP = parser('', [], [{ dest: 'cmd', nargs: 'PARSER', choices: Object.keys(SUBPARSERS) }]);

const NEG_NUMBER = /^-\.?\p{Nd}/u; // _negative_number_matcher.match(): a prefix match

/** the regex fragment argparse builds per action over the A/O/- pattern string */
function nargsPattern(a, isOption) {
  if (isOption) return a.nargs === 0 ? '([AO]{0})' : '([A])';
  return a.nargs === 'PARSER' ? '(-*A[-AO]*)' : '((?:-*A){1}-*)';
}

/** parse_known_args of one parser: [namespace, extras]; throws ArgumentError (caller reports it) or ExitError */
function parseKnown(p, argStrings) {
  const ns = {};
  for (const o of p.options) if (!o.help) ns[o.dest] = o.deflt;
  for (const q of p.positionals) ns[q.dest] = null;
  const optMap = new Map();
  for (const o of p.options) for (const f of o.flags) optMap.set(f, o);
  const extras = [];
  let fromSub = [];

  const optionTuples = (arg) => {
    const out = [];
    const eq = arg.indexOf('=');
    const prefix = eq < 0 ? arg : arg.slice(0, eq);
    const sep = eq < 0 ? null : '=';
    const expl = eq < 0 ? null : arg.slice(eq + 1);
    if (arg[1] === '-') {
      for (const [s, a] of optMap) if (s.startsWith(prefix)) out.push([a, s, sep, expl]);
    } else {
      for (const [s, a] of optMap) {
        if (s === arg.slice(0, 2)) out.push([a, s, '', arg.slice(2)]);
        else if (s.startsWith(prefix)) out.push([a, s, sep, expl]);
      }
    }
    return out;
  };
  const parseOptional = (arg) => {
    if (!arg || arg[0] !== '-') return null;
    if (optMap.has(arg)) return [[optMap.get(arg), arg, null, null]];
    if (arg.length === 1) return null;
    const eq = arg.indexOf('=');
    if (eq >= 0 && optMap.has(arg.slice(0, eq))) return [[optMap.get(arg.slice(0, eq)), arg.slice(0, eq), '=', arg.slice(eq + 1)]];
    const t = optionTuples(arg);
    if (t.length) return t;
    if (NEG_NUMBER.test(arg)) return null; // no option of these parsers looks like a negative number
    if (arg.includes(' ')) return null;
    return [[null, arg, null, null]];
  };

  const optionIdx = new Map();
  let pattern = '';
  for (let i = 0; i < argStrings.length; i++) {
    if (argStrings[i] === '--') {
      pattern += '-';
      for (i++; i < argStrings.length; i++) pattern += 'A';
    } else {
      const t = parseOptional(argStrings[i]);
      if (t === null) pattern += 'A';
      else {
        optionIdx.set(i, t);
        pattern += 'O';
      }
    }
  }

  const seen = new Set();
  const take = (a, args) => {
    seen.add(a);
    if (a.help) {
      process.stdout.write(USAGE[p.key].help);
      throw new ExitError(0);
    }
    if (a.nargs === 0) ns[a.dest] = true;
    else if (a.nargs === 'PARSER') {
      if (!a.choices.includes(args[0])) throw aerr(a, `invalid choice: ${repr(args[0])} (choose from ${a.choices.join(', ')})`);
      ns[a.dest] = args[0];
      const [subNs, subExtras] = parseOrReport(SUBPARSERS[args[0]], args.slice(1));
      Object.assign(ns, subNs);
      fromSub = fromSub.concat(subExtras);
    } else ns[a.dest] = args[0];
  };
  const matchOption = (a, pat) => {
    const m = new RegExp(`^${nargsPattern(a, true)}`).exec(pat);
    if (!m) throw aerr(a, 'expected one argument');
    return m[1].length;
  };

  const consumeOptional = (start) => {
    const tuples = optionIdx.get(start);
    if (tuples.length > 1) throw aerr(null, `ambiguous option: ${argStrings[start]} could match ${tuples.map((t) => t[1]).join(', ')}`);
    let [action, optionString, sep, explicit] = tuples[0];
    const done = [];
    let stop;
    for (;;) {
      if (action === null) {
        extras.push(argStrings[start]);
        return start + 1;
      }
      if (explicit !== null) {
        const count = matchOption(action, 'A');
        if (count === 0 && optionString[1] !== '-' && explicit !== '') {
          if (sep || explicit[0] === '-') throw aerr(action, `ignored explicit argument ${repr(explicit)}`);
          done.push([action, []]);
          const ch = optionString[0];
          optionString = ch + explicit[0];
          if (optMap.has(optionString)) {
            action = optMap.get(optionString);
            explicit = explicit.slice(1);
            if (!explicit) sep = explicit = null;
            else if (explicit[0] === '=') {
              sep = '=';
              explicit = explicit.slice(1);
            } else sep = '';
          } else {
            extras.push(ch + explicit);
            stop = start + 1;
            break;
          }
        } else if (count === 1) {
          stop = start + 1;
          done.push([action, [explicit]]);
          break;
        } else throw aerr(action, `ignored explicit argument ${repr(explicit)}`);
      } else {
        const from = start + 1;
        stop = from + matchOption(action, pattern.slice(from));
        done.push([action, argStrings.slice(from, stop)]);
        break;
      }
    }
    for (const [a, args] of done) take(a, args);
    return stop;
  };

  let positionals = [...p.positionals];
  const consumePositionals = (start) => {
    const sel = pattern.slice(start);
    let counts = [];
    for (let n = positionals.length; n > 0; n--) {
      const m = new RegExp(`^${positionals.slice(0, n).map((q) => nargsPattern(q, false)).join('')}`).exec(sel);
      if (m) {
        counts = m.slice(1).map((s) => s.length);
        if (m[0].length < sel.length && sel[m[0].length] === 'O') while (counts.length && !counts.at(-1)) counts.pop();
        break;
      }
    }
    let idx = start;
    counts.forEach((cnt, k) => {
      const a = positionals[k];
      const args = argStrings.slice(idx, idx + cnt);
      if (a.nargs === 'PARSER' ? pattern[idx] === '-' : pattern.slice(idx, idx + cnt).includes('-')) args.splice(args.indexOf('--'), 1);
      idx += cnt;
      take(a, args);
    });
    positionals = positionals.slice(counts.length);
    return idx;
  };

  let start = 0;
  const maxOpt = optionIdx.size ? Math.max(...optionIdx.keys()) : -1;
  while (start <= maxOpt) {
    let next = start;
    while (next <= maxOpt && !optionIdx.has(next)) next++;
    if (start !== next) {
      const end = consumePositionals(start);
      if (end > start) {
        start = end;
        continue;
      }
    }
    if (!optionIdx.has(start)) {
      extras.push(...argStrings.slice(start, next));
      start = next;
    }
    start = consumeOptional(start);
  }
  extras.push(...argStrings.slice(consumePositionals(start)));

  const missing = [...p.options.filter((o) => o.required && !seen.has(o)).map(nameOf), ...p.positionals.filter((q) => !seen.has(q)).map(nameOf)];
  if (missing.length) throw aerr(null, `the following arguments are required: ${missing.join(', ')}`);
  return [ns, extras.concat(fromSub)];
}

/** a parser reports its own errors with its own usage line (python: parser.error -> exit 2) */
function parseOrReport(p, args) {
  try {
    return parseKnown(p, args);
  } catch (e) {
    if (!(e instanceof ArgumentError)) throw e;
    return fatal(p, e.message);
  }
}
function fatal(p, message) {
  process.stderr.write(`${USAGE[p.key].usage}action-log.mjs${p.key ? ` ${p.key}` : ''}: error: ${message}\n`);
  throw new ExitError(2);
}

/** parse_args(argv): the namespace (`cmd`, `task_dir`, ...) or an ExitError after python's usage / help output */
export function parseArgs(argv) {
  const [ns, extras] = parseOrReport(TOP, argv);
  if (extras.length) fatal(TOP, `unrecognized arguments: ${extras.join(' ')}`);
  return ns;
}
