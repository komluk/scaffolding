# Copilot CLI sync tooling

Ports the scaffolding agents, skills and the pre-commit validation hook to GitHub Copilot CLI (`~/.copilot`).

Install (plugin already installed): `bash <plugin-root>/copilot/install.sh`
It copies these files into `~/.copilot` and runs `~/.copilot/scaffolding-sync.sh`.

After a plugin upgrade, re-run `~/.copilot/scaffolding-sync.sh`.
`~/.copilot/hooks/pre-commit-validation-copilot.sh` is generated from the `.tmpl`; never edit it by hand.
