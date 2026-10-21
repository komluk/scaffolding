#!/usr/bin/env python3
"""Regenerate hooks/lib/secret-patterns.json from aiproxy's presidio_recognizers.json.

Usage: sync-secret-patterns.py <path-to-presidio_recognizers.json> [--check]

Only secret-class entities are vendored (an allowlist). INTERNAL_DOMAIN and
PRIVATE_IP are deliberately NOT in it: the plugin repo is public, so no internal
hostname literal may be embedded. --check exits 1 when the vendored file drifts.
"""
import json
import os
import sys

ALLOW = [
    "GITLAB_PAT", "LINEAR_API_KEY", "ANTHROPIC_API_KEY", "VAULT_TOKEN", "NPM_TOKEN",
    "GITEA_PAT", "CLOUDFLARE_TOKEN", "PROXMOX_TOKEN", "TAILSCALE_KEY", "SK_PREFIXED_KEY",
    "AZURE_DEVOPS_PAT", "AZURE_AD_SECRET", "AZURE_SAS_TOKEN", "STORAGE_KEY_B64",
    "NUGET_API_KEY", "PEM_PRIVATE_KEY", "GITHUB_TOKEN", "AWS_ACCESS_KEY", "SLACK_TOKEN",
    "PL_PESEL", "IBAN_SPACED", "PL_BANK_ACCOUNT",
]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "hooks", "lib", "secret-patterns.json")


def build(src):
    with open(src, encoding="utf-8") as fh:
        recs = {r["supported_entity"]: r for r in json.load(fh)}
    out = []
    for name in ALLOW:
        rec = recs.get(name)
        if rec is None:
            raise SystemExit("entity missing in source: " + name)
        for pat in rec["patterns"]:
            out.append({"entity": name, "name": pat["name"], "regex": pat["regex"]})
    return {"version": 1, "source": "aiproxy presidio_recognizers.json", "patterns": out}


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    text = json.dumps(build(args[0]), indent=1, ensure_ascii=False) + "\n"
    if "--check" in argv:
        with open(OUT, encoding="utf-8") as fh:
            return 0 if fh.read() == text else 1
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
