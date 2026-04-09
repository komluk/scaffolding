# /init-openspec Command

Initialize OpenSpec in a project directory with the scaffolding-workflow schema.

## Usage

```
/init-openspec [project-path]
```

If no path is provided, initializes in the current working directory.

## What It Does

Sets up OpenSpec spec-driven development tooling in a project:

1. Installs/verifies OpenSpec CLI
2. Initializes OpenSpec directory structure
3. Copies the scaffolding-workflow custom schema

## Steps

1. **Verify OpenSpec CLI is available**
   ```bash
   openspec --version || npm install -g @fission-ai/openspec@latest
   ```

2. **Initialize OpenSpec in target directory**
   ```bash
   openspec init --tools claude [project-path]
   ```
   This creates `.scaffolding/openspec/` directory and `.claude/commands/specs/` command files.

3. **Copy the scaffolding-workflow schema**
   ```bash
   openspec schema fork spec-driven scaffolding-workflow
   ```
   Then replace the generated schema with the customized version from:
   `__CLAUDE_HOME_SCHEMAS_DIR__/scaffolding-workflow/schema.yaml`

4. **Create the conversations directory**
   ```bash
   mkdir -p .scaffolding/conversations/
   ```

5. **Verify installation**
   ```bash
   openspec schemas
   openspec schema validate scaffolding-workflow
   ```

## Output

After completion, confirm:
- OpenSpec version installed
- Directory structure created (`.scaffolding/openspec/specs/`, `.scaffolding/openspec/schemas/`, `.scaffolding/conversations/`)
- Commands available (`/specs:new`, `/specs:ff`, `/specs:apply`, etc.)
- Custom schema `scaffolding-workflow` validated and available

## Available OpenSpec Commands After Init

| Command | Purpose |
|---------|---------|
| `/specs:new` | Start a new spec-driven change |
| `/specs:ff` | Fast-forward: generate all artifacts at once |
| `/specs:apply` | Implement tasks from specs |
| `/specs:continue` | Create the next artifact |
| `/specs:verify` | Verify implementation matches specs |
| `/specs:archive` | Archive completed change |

## Notes

- Requires Node.js >= 20.19.0
- Does not modify existing `.claude/commands/` files
- Specs in `.scaffolding/openspec/specs/` and schemas in `.scaffolding/openspec/schemas/` are tracked in git
- Conversation specs live in `.scaffolding/conversations/{conversation_id}/specs/`
