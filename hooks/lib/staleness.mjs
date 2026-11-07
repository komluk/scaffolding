#!/usr/bin/env node
// staleness.mjs — mtime store for file-staleness-check.sh / file-staleness-update.sh (Node >= 22, no deps).
//
//   check   stdin = hook JSON. Exit 2 + message on stderr when the file changed since the task last saw it.
//   update  stdin = hook JSON. Records the file's current mtime.
//
// The store is /tmp/scaffolding-mtime-<SCAFFOLDING_TASK_ID>.json: {"<abs path>": "<mtime seconds>"}.
// Its format is shared with the backend (staleness.ts), so values stay strings of whole seconds and the
// JSON is written exactly as python's json.dump did (", " / ": " separators, ensure_ascii).
// Behaviour is byte-compatible with the python implementation this replaces, quirks included:
//  - the mtime is the one stat(1) printed, WITHOUT -L: a symlink reports its own mtime;
//  - a path starting with "-" was taken as a stat option, so it counted as "cannot stat" (allow);
//  - a store that is valid JSON but not an object crashed python (exit 1, traceback) - exit 1 here too.
import fs from 'node:fs';
import { encodeSurrogateEscape, lookup, parseJson, pyDumps, pyStr, readStdin, shellValue, toolInput } from './hook-io.mjs';

const taskId = process.env.SCAFFOLDING_TASK_ID ?? '';
const strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** the file_path the python one-liner printed and `$(...)` captured; '' on anything odd */
function filePathFromStdin() {
  try {
    const s = pyStr(lookup(toolInput(parseJson(readStdin())), ['file_path']));
    encodeSurrogateEscape(s); // python print() raises on surrogates it cannot write -> ''
    return shellValue(s);
  } catch {
    return '';
  }
}

/** `stat -c %Y`: whole seconds, floored, of the entry itself; null when stat would fail */
function mtimeSeconds(p) {
  if (p.length > 1 && p.startsWith('-')) return null; // stat(1) parsed it as an option
  try {
    const ns = fs.lstatSync(p, { bigint: true }).mtimeNs;
    let sec = ns / 1_000_000_000n;
    if (ns % 1_000_000_000n < 0n) sec -= 1n;
    return String(sec);
  } catch {
    return null;
  }
}

const isRegularFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** python: json.load(f) except (JSONDecodeError, FileNotFoundError) -> {} */
function loadStore(storePath) {
  let text;
  try {
    text = strict.decode(fs.readFileSync(storePath));
  } catch (e) {
    if (e?.code === 'ENOENT') return new Map();
    throw e;
  }
  let store;
  try {
    store = parseJson(text);
  } catch {
    return new Map();
  }
  if (!(store instanceof Map)) throw new TypeError('store is not a JSON object');
  return store;
}

const saveStore = (storePath, store) => fs.writeFileSync(storePath, pyDumps(store));

function run(mode) {
  if (!taskId) return 0;
  const filePath = filePathFromStdin();
  if (!filePath || !isRegularFile(filePath)) return 0;
  const current = mtimeSeconds(filePath);
  if (current === null) return 0;
  const storePath = `/tmp/scaffolding-mtime-${taskId}.json`;

  if (mode === 'update') {
    const store = loadStore(storePath);
    store.set(filePath, current);
    saveStore(storePath, store);
    return 0;
  }

  if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, '{}\n');
  const store = loadStore(storePath);
  const stored = store.has(filePath) ? store.get(filePath) : null;
  if (stored === null) {
    store.set(filePath, current);
    saveStore(storePath, store);
    return 0;
  }
  if (stored === current) return 0;
  process.stderr.write(
    `File staleness conflict: ${filePath} was modified externally (stored mtime=${pyStr(stored)}, current mtime=${current}). Re-read the file before editing.\n`,
  );
  return 2;
}

const mode = process.argv[2];
if (mode !== 'check' && mode !== 'update') {
  process.stderr.write('usage: staleness.mjs check|update  (hook JSON on stdin)\n');
  process.exit(64);
}
try {
  process.exitCode = run(mode);
} catch (e) {
  process.stderr.write(`staleness.mjs: ${e?.message ?? e}\n`);
  process.exitCode = 1;
}
