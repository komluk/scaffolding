#!/usr/bin/env node
// scaffolding-skills-merge.mjs — strip stale scaffolding-cache skillDirectories entries from ~/.copilot/settings.json
// before `copilot skill add` registers the current version (design A5 / group 5, optional, non-gating).
//
// Never touches disabledSkills or any other key. Only removes entries whose path is under the komluk-scaffolding cache
// root -- a user's own custom skill directories are left untouched.
//
// Usage:
//   scaffolding-skills-merge.mjs <settings.json> <src-root>   # pre-add strip
//   scaffolding-skills-merge.mjs --remove <settings.json>     # uninstall
//
// Plain ESM, Node >= 22. A settings file of an unexpected shape makes it fail (exit 1, nothing written), as before.
import os from 'node:os';
import { load, save } from './scaffolding-json.mjs';

// python: os.path.join(os.path.expanduser("~"), ".claude", ...). expanduser takes $HOME as is (trailing slashes cut, '/' if
// nothing is left) and only falls back to the passwd entry when HOME is unset.
const home = process.env.HOME === undefined ? os.homedir() : process.env.HOME.replace(/\/+$/, '') || '/';
const CACHE_ROOT_MARKER = `${home === '/' ? '' : home}/.claude/plugins/cache/komluk-scaffolding/scaffolding`;

function stripCacheEntries(settings) {
  if (!(settings instanceof Map)) throw new TypeError('unexpected settings.json shape');
  const dirs = settings.has('skillDirectories') ? settings.get('skillDirectories') : null;
  if (!Array.isArray(dirs)) return false;
  // python str(d).startswith(marker): only a string can start with an absolute path, a repr of anything else cannot
  const kept = dirs.filter((d) => !(typeof d === 'string' && d.startsWith(CACHE_ROOT_MARKER)));
  if (kept.length === dirs.length) return false;
  if (kept.length) settings.set('skillDirectories', kept);
  else settings.delete('skillDirectories');
  return true;
}

function main(argv) {
  let args = argv;
  let removeMode = false;
  if (args[0] === '--remove') {
    removeMode = true;
    args = args.slice(1);
  }
  if (removeMode ? args.length !== 1 : args.length !== 2) {
    console.error(removeMode ? 'usage: scaffolding-skills-merge.mjs --remove <settings.json>' : 'usage: scaffolding-skills-merge.mjs <settings.json> <src-root>');
    return 1;
  }
  const settingsPath = args[0];
  const settings = load(settingsPath);
  if (stripCacheEntries(settings)) save(settingsPath, settings);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`scaffolding-skills-merge: ${e.message}`);
  process.exitCode = 1;
}
