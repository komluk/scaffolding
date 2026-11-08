#!/usr/bin/env node
// Regenerate hooks/lib/secret-patterns.json from aiproxy's presidio_recognizers.json.
//
// Usage: sync-secret-patterns.mjs <path-to-presidio_recognizers.json> [--check]
//
// Only secret-class entities are vendored (an allowlist). INTERNAL_DOMAIN and PRIVATE_IP are deliberately NOT in it:
// the plugin repo is public, so no internal hostname literal may be embedded. --check exits 1 when the vendored file drifts.
// The patterns are copied as written (python `re` syntax); hooks/lib/action-log/redact.mjs converts them for JS at load time.
//
// Plain ESM, Node >= 22, no npm deps.
import fs from 'node:fs';
import path from 'node:path';

const ALLOW = [
  'GITLAB_PAT', 'LINEAR_API_KEY', 'ANTHROPIC_API_KEY', 'VAULT_TOKEN', 'NPM_TOKEN',
  'GITEA_PAT', 'CLOUDFLARE_TOKEN', 'PROXMOX_TOKEN', 'TAILSCALE_KEY', 'SK_PREFIXED_KEY',
  'AZURE_DEVOPS_PAT', 'AZURE_AD_SECRET', 'AZURE_SAS_TOKEN', 'STORAGE_KEY_B64',
  'NUGET_API_KEY', 'PEM_PRIVATE_KEY', 'GITHUB_TOKEN', 'AWS_ACCESS_KEY', 'SLACK_TOKEN',
  'PL_PESEL', 'IBAN_SPACED', 'PL_BANK_ACCOUNT',
];
const OUT = path.join(import.meta.dirname, '..', '..', 'hooks', 'lib', 'secret-patterns.json');
const USAGE = 'usage: sync-secret-patterns.mjs <path-to-presidio_recognizers.json> [--check]';

function build(src) {
  const recs = new Map(JSON.parse(fs.readFileSync(src, 'utf8')).map((r) => [r.supported_entity, r]));
  const patterns = [];
  for (const name of ALLOW) {
    const rec = recs.get(name);
    if (rec === undefined) throw new Error(`entity missing in source: ${name}`);
    for (const pat of rec.patterns) patterns.push({ entity: name, name: pat.name, regex: pat.regex });
  }
  return { version: 1, source: 'aiproxy presidio_recognizers.json', patterns };
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  if (args.length !== 1) {
    console.error(USAGE);
    return 2;
  }
  const text = `${JSON.stringify(build(args[0]), null, 1)}\n`;
  if (argv.includes('--check')) return fs.readFileSync(OUT, 'utf8') === text ? 0 : 1;
  fs.writeFileSync(OUT, text);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`sync-secret-patterns: ${e.message}`);
  process.exitCode = 1;
}
