#!/usr/bin/env node
// scaffolding-hook-merge.mjs — idempotently merge (or remove) the scaffolding PreToolUse hook entry into a repo's
// .claude/settings.json, per design D2 (post-Task-0 authoritative shape, V15-V18).
//
// Never clobbers existing keys/hooks (e.g. PreCompact, SessionStart already present). Merge target shape:
//
//   {"hooks": {"PreToolUse": [{"matcher": "Bash",
//                              "hooks": [{"type": "command",
//                                         "command": "<wrapper>",
//                                         "timeout": 120}]}]}}
//
// Usage:
//   scaffolding-hook-merge.mjs <settings.json> <wrapper-abs-path>
//   scaffolding-hook-merge.mjs --remove <settings.json> <wrapper-abs-path>
//
// Plain ESM, Node >= 22. A settings file of an unexpected shape makes it fail (exit 1, nothing written), as before.
import { load, save } from './scaffolding-json.mjs';

const need = (ok) => {
  if (!ok) throw new TypeError('unexpected settings.json shape');
};
const isMap = (v) => v instanceof Map;

/** python `d.setdefault(k, dflt)` */
function setdefault(map, key, dflt) {
  if (!map.has(key)) map.set(key, dflt);
  return map.get(key);
}

function merge(settings, wrapper) {
  need(isMap(settings));
  const hooks = setdefault(settings, 'hooks', new Map());
  need(isMap(hooks));
  const entries = setdefault(hooks, 'PreToolUse', []);
  if (!Array.isArray(entries)) throw new Error('hooks.PreToolUse is not an array — refusing to clobber');

  const fresh = () =>
    new Map([
      ['type', 'command'],
      ['command', wrapper],
      ['timeout', 120n],
    ]);
  for (const entry of entries) {
    need(isMap(entry));
    if (entry.get('matcher') === 'Bash') {
      const inner = setdefault(entry, 'hooks', []);
      need(Array.isArray(inner));
      for (const h of inner) {
        need(isMap(h)); // reached only until the first match, like python's any()
        if (h.get('command') === wrapper) return false; // already present, idempotent no-op
      }
      inner.push(fresh());
      return true;
    }
  }
  entries.push(
    new Map([
      ['matcher', 'Bash'],
      ['hooks', [fresh()]],
    ]),
  );
  return true;
}

function remove(settings, wrapper) {
  need(isMap(settings));
  const hooks = settings.has('hooks') ? settings.get('hooks') : new Map();
  need(isMap(hooks));
  const entries = hooks.has('PreToolUse') ? hooks.get('PreToolUse') : null;
  if (!Array.isArray(entries)) return false;

  let changed = false;
  const kept = [];
  for (const entry of entries) {
    need(isMap(entry));
    if (entry.get('matcher') === 'Bash') {
      let inner = entry.has('hooks') ? entry.get('hooks') : [];
      if ((isMap(inner) && inner.size === 0) || inner === '') inner = []; // iterating an empty dict / str yields nothing
      need(Array.isArray(inner));
      for (const h of inner) need(isMap(h));
      const next = inner.filter((h) => h.get('command') !== wrapper);
      if (next.length !== inner.length) changed = true;
      if (next.length) {
        entry.set('hooks', next);
        kept.push(entry);
      } // else: drop the whole matcher entry, it's now empty
    } else kept.push(entry);
  }

  if (changed) {
    hooks.set('PreToolUse', kept);
    if (!kept.length) hooks.delete('PreToolUse');
  }
  return changed;
}

function main(argv) {
  let args = argv;
  let removeMode = false;
  if (args[0] === '--remove') {
    removeMode = true;
    args = args.slice(1);
  }
  if (args.length !== 2) {
    console.error('usage: scaffolding-hook-merge.mjs [--remove] <settings.json> <wrapper-abs-path>');
    return 1;
  }
  const [settingsPath, wrapper] = args;
  const settings = load(settingsPath);
  const changed = removeMode ? remove(settings, wrapper) : merge(settings, wrapper);
  if (changed) save(settingsPath, settings);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`scaffolding-hook-merge: ${e.message}`);
  process.exitCode = 1;
}
