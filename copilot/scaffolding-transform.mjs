#!/usr/bin/env node
// scaffolding-transform.mjs — frontmatter transform for one scaffolding agent file, per design D3/D4
// (Port scaffolding agent system to GitHub Copilot CLI).
//
// Usage:
//   scaffolding-transform.mjs <agent-name> <source.md> <dest.md>
//
// Transform rules (design D3/D4, tasks.md 2.1):
//   - name: <agent>          -> name: scaffolding:<agent>
//   - infer: true             added
//   - tools, model, effort, maxTurns, disallowedTools   stripped (with their continuation lines)
//   - description, skills     kept verbatim (the source lines are copied as written)
//   - everything else         dropped, as before
//   - body                    passed through byte-for-byte
//   - marker HTML comment appended immediately after the closing '---'
//
// Plain ESM, Node >= 22, no YAML library: the frontmatter is rewritten line by line, so description / skills keep the
// source formatting instead of being re-serialised (the python version re-dumped them with yaml.safe_dump; the values
// are the same, the quoting / wrapping is the source's).
//
// Writes atomically: to <dest>.tmp then rename into <dest>.
import fs from 'node:fs';

const KEY = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:(.*)$/s;

/** [{ key, lines }] for the top-level keys of a frontmatter block; a key owns every following line that is not a new key */
export function topLevelBlocks(fm) {
  const blocks = [];
  for (const line of fm.split('\n')) {
    const m = KEY.exec(line);
    if (m) blocks.push({ key: m[1], lines: [line], value: m[2] });
    else if (blocks.length) blocks.at(-1).lines.push(line);
    else if (line.trim() !== '' && !line.trimStart().startsWith('#')) throw new Error('frontmatter does not start with a "key:" line');
  }
  return blocks;
}

/** the plain scalar of a one-line `key: value`, for the name check only */
const scalar = (value) => {
  const v = value.replace(/\s+#.*$/, '').trim();
  const q = /^(["'])(.*)\1$/.exec(v);
  return q ? q[2] : v;
};

/** the transformed text, plus a warning when the source name differs */
export function transform(agent, srcPath, text) {
  if (!text.startsWith('---\n')) throw new Error('source file does not start with a YAML frontmatter block');
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) throw new Error("source file has no closing '---' for frontmatter");
  const blocks = topLevelBlocks(text.slice(4, end));
  const body = text.slice(end + 5);

  const byKey = new Map();
  for (const b of blocks) byKey.set(b.key, b); // a repeated key: the last wins, like a YAML mapping loader
  const name = byKey.get('name');
  const have = name ? scalar(name.value) : null;
  const warning = have === agent ? null : `WARNING: source frontmatter name=${have === null ? 'None' : `'${have}'`} does not match expected agent '${agent}'`;

  const trimTail = (lines) => {
    const out = [...lines];
    while (out.length > 1 && out.at(-1).trim() === '') out.pop();
    return out;
  };
  const out = [`name: scaffolding:${agent}`];
  for (const key of ['description', 'skills']) if (byKey.has(key)) out.push(...trimTail(byKey.get(key).lines));
  out.push('infer: true');
  const marker = `<!-- generated-by: scaffolding-copilot-sync | source: ${srcPath} -->\n`;
  return { warning, text: `---\n${out.join('\n')}\n---\n${marker}${body}` };
}

function main(argv) {
  if (argv.length !== 3) {
    console.error('usage: scaffolding-transform.mjs <agent-name> <source.md> <dest.md>');
    return 1;
  }
  const [agent, srcPath, destPath] = argv;
  const { warning, text } = transform(agent, srcPath, fs.readFileSync(srcPath, 'utf8'));
  if (warning) console.error(warning);
  const tmp = `${destPath}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, destPath);
  return 0;
}

try {
  if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`scaffolding-transform: ${e.message}`);
  process.exitCode = 1;
}
