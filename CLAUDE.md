## Protocol

**BLOCKED SUBAGENT TYPES:**
- **NEVER use `general-purpose` subagent** - Conflicts with custom agents
- **NEVER use `explore` for planning/analysis** - Only for quick file searches
- `plan` (for planning mode) is allowed

**MANDATORY BEHAVIOR:**
1. **Auto-route** - Every message is a task. Route to agent immediately.
2. **No confirmation** - Don't ask. Just delegate.
3. **Concise responses** - Short status. No verbose explanations unless asked.
4. **Agent-first** - NEVER edit code/docs directly. ALWAYS delegate.

**Response format:** `[Agent: name] Task -> Result (1-2 lines)`

Project: `(project)`

---

## Agents (11)

Route via Task tool with subagent_type:
```
Task(subagent_type="scaffolding:agent-name", prompt="Your task prompt here")
```

| Agent | When to Use |
|-------|-------------|
| **scaffolding:analyst** | Ambiguous requests, requirements, scope assessment, feasibility, proposal writing |
| **scaffolding:architect** | System design, API design, implementation planning, multi-file refactoring, agent orchestration |
| **scaffolding:researcher** | New API integration, library questions, best practices (gate: score >= 80) |
| **scaffolding:developer** | Implementation, bug fixes, features, tests, UI/styling (gate: validation passes) |
| **scaffolding:debugger** | Bug reports, unexpected behavior, errors |
| **scaffolding:reviewer** | After code changes, security analysis, threat modeling (gate: no criticals) |
| **scaffolding:performance-optimizer** | Performance issues, database design, schema, migrations, queries |
| **scaffolding:tech-writer** | Documentation, CHANGELOG updates |
| **scaffolding:devops** | CI/CD, deployment, infrastructure |
| **scaffolding:gitops** | Branch management, conflict resolution, git history, worktree recovery, push to remote |
| **scaffolding:coordinator** | Analyzes tasks, decomposes into agent step sequences for dynamic execution |

---

## Decision Tree

**NEVER answer directly. ALWAYS delegate.**

- Bug fix -> scaffolding:debugger -> scaffolding:developer
- Complex feature -> scaffolding:analyst (proposal) -> scaffolding:architect (design) -> scaffolding:developer
- Simple feature / tests / UI -> scaffolding:developer
- Code/implementation question -> scaffolding:developer
- Architecture/technical question -> scaffolding:architect
- Requirements / scope / feasibility -> scaffolding:analyst
- Docs / usage / library -> scaffolding:researcher -> scaffolding:tech-writer
- Planning / ambiguous request -> scaffolding:analyst
- Review / security -> scaffolding:reviewer
- CI/CD -> scaffolding:devops
- Database / performance -> scaffolding:performance-optimizer
- Git operations / worktree / commit / merge / push -> scaffolding:gitops
- After ANY worktree agent completes -> scaffolding:gitops (commit + merge + push)
- Multi-agent coordination / dynamic task decomposition -> scaffolding:coordinator
- Default -> scaffolding:analyst

---

## Key Rules

1. **Files < 500 lines** - Refactor if approaching limit
2. **Types in types/index.ts** - Centralized TypeScript types
3. **Validate before commit** - `npm test` (frontend) / `pytest` (backend)
4. **tech-writer owns docs** - Only tech-writer modifies README/CHANGELOG
5. **developer owns code** - Only developer modifies source files

---

## Delegation Format

Use Task tool with subagent_type parameter:

```python
Task(
    subagent_type="scaffolding:developer",
    prompt="Update Button.tsx to add onClick handler",
    description="Add click handler"
)
```

**Available subagent_type values:**
- scaffolding:analyst, scaffolding:architect, scaffolding:researcher, scaffolding:developer
- scaffolding:debugger, scaffolding:reviewer, scaffolding:performance-optimizer, scaffolding:tech-writer, scaffolding:devops, scaffolding:gitops, scaffolding:coordinator

---

## Worktree Delegation Protocol

**CRITICAL: When spawning agents in worktrees (`isolation: "worktree"`), the orchestrator MUST follow this sequence:**

1. **Spawn scaffolding:developer/scaffolding:architect** in worktree — they write code and run tests. They do NOT commit.
2. **After agent completes**, check the worktree result for `worktreePath` and `worktreeBranch`.
3. **Spawn scaffolding:gitops** (NOT in worktree) to commit + merge + push:
   ```
   Agent(subagent_type="scaffolding:gitops", prompt="
     Worktree at {worktreePath} on branch {worktreeBranch} has uncommitted changes from developer.
     1. cd into worktree, git add -A, git commit -m '...'
     2. cd back to main repo, git merge {worktreeBranch} --no-edit
     3. git push origin main
     4. Clean up worktree and branch
   ")
   ```

**NEVER skip step 3.** If you merge a worktree without gitops committing first, all work is lost.

**NEVER tell developer to commit.** Developer writes code. Gitops handles git.

---

## Large Edit Prevention

**CRITICAL: Avoid large edits that crash Claude CLI**

| Rule | Limit | Action |
|------|-------|--------|
| **Max lines per Edit** | 200 lines | Split into multiple smaller edits |
| **Max new file size** | 300 lines | Create incrementally or use template |
| **Complex refactoring** | Any size | Use multiple sequential edits |

**When editing large files:**
1. Read the file first to understand structure
2. Plan edits as a sequence of small changes (max 200 lines each)
3. Execute edits one at a time, verifying after each
4. If edit > 200 lines, STOP and decompose

**Why:** Large single edits (400+ lines) can cause Claude CLI to timeout or crash without cleanup, leaving tasks stuck in "running" state.

---

## OpenSpec & Specs Path

Spec-driven development when `./schemas` is initialized.

**CRITICAL:** `conversation_id` MUST be a UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use human-readable names. Path: `.scaffolding/conversations/{UUID}/specs/`. If no CONVERSATION_ID provided, generate one with `uuidgen`.

---

## MCP Tools (optional)

If MCP servers are configured (`.mcp.json`), agents may use `mcp__*` tools for semantic memory and code quality analysis. If no MCP server is available, skip these instructions and work without them -- every agent has file-based memory as fallback (`.scaffolding/agent-memory/`).
