#!/usr/bin/env node
// Lint YAML: the frontmatter of agents/**/*.md, skills/**/SKILL.md, commands/**/*.md and every workflows/*.yaml.
//
// Usage: lint-yaml.mjs <dir-containing-node_modules/yaml>      (CI: `npm install --prefix "$RUNNER_TEMP/yaml" yaml@2.9.1`)
//
// Plain ESM, Node >= 22. The YAML parser is the pinned `yaml` package, installed only in CI into a temp dir, so the repo
// itself carries no package.json / node_modules. Exit 1 on any error.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: lint-yaml.mjs <dir with node_modules/yaml>');
  process.exit(2);
}
const { parse } = createRequire(path.join(path.resolve(dir), 'x.js'))('yaml');

function* walk(root) {
  if (!fs.existsSync(root)) return;
  for (const e of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const frontmatter = [
  ...[...walk('agents')].filter((f) => f.endsWith('.md')),
  ...[...walk('skills')].filter((f) => path.basename(f) === 'SKILL.md'),
  ...[...walk('commands')].filter((f) => f.endsWith('.md')),
].sort();
const failed = [];
for (const f of frontmatter) {
  const text = fs.readFileSync(f, 'utf8');
  if (!text.startsWith('---')) continue;
  const end = text.indexOf('\n---', 4);
  if (end === -1) {
    failed.push(`${f}: unterminated frontmatter`);
    continue;
  }
  try {
    const doc = parse(text.slice(4, end));
    if (doc !== null && (typeof doc !== 'object' || Array.isArray(doc))) failed.push(`${f}: frontmatter is not a mapping`);
  } catch (e) {
    failed.push(`${f}: ${String(e.message).split('\n')[0]}`);
  }
}
if (failed.length) {
  console.log('frontmatter errors:');
  for (const l of failed) console.log(`  ${l}`);
}
console.log(`checked ${frontmatter.length} files for frontmatter`);

const flows = fs.existsSync('workflows') ? fs.readdirSync('workflows').filter((n) => n.endsWith('.yaml')).sort() : [];
const flowFailed = [];
for (const n of flows) {
  try {
    parse(fs.readFileSync(path.join('workflows', n), 'utf8'));
  } catch (e) {
    flowFailed.push(`workflows/${n}: ${String(e.message).split('\n')[0]}`);
  }
}
if (flowFailed.length) {
  console.log('workflow YAML errors:');
  for (const l of flowFailed) console.log(`  ${l}`);
}
console.log(`checked ${flows.length} workflow file(s)`);
process.exit(failed.length || flowFailed.length ? 1 : 0);
