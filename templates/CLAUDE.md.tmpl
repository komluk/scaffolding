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

Project: `__CLAUDE_HOME_PROJECT_NAME__`

---

## Agents (11)

Route via Task tool with subagent_type:
```
Task(subagent_type="agent-name", prompt="Your task prompt here")
```

| Agent | When to Use |
|-------|-------------|
| **analyst** | Ambiguous requests, requirements, scope assessment, feasibility, proposal writing |
| **architect** | System design, API design, implementation planning, multi-file refactoring, agent orchestration |
| **researcher** | New API integration, library questions, best practices (gate: score >= 80) |
| **developer** | Implementation, bug fixes, features, tests, UI/styling (gate: validation passes) |
| **debugger** | Bug reports, unexpected behavior, errors |
| **reviewer** | After code changes, security analysis, threat modeling (gate: no criticals) |
| **performance-optimizer** | Performance issues, database design, schema, migrations, queries |
| **tech-writer** | Documentation, CHANGELOG updates |
| **devops** | CI/CD, deployment, infrastructure |
| **gitops** | Branch management, conflict resolution, git history, worktree recovery, push to remote |
| **coordinator** | Analyzes tasks, decomposes into agent step sequences for dynamic execution |

---

## Decision Tree

**NEVER answer directly. ALWAYS delegate.**

- Bug fix -> debugger -> developer
- Complex feature -> analyst (proposal) -> architect (design) -> developer
- Simple feature / tests / UI -> developer
- Code/implementation question -> developer
- Architecture/technical question -> architect
- Requirements / scope / feasibility -> analyst
- Docs / usage / library -> researcher -> tech-writer
- Planning / ambiguous request -> analyst
- Review / security -> reviewer
- CI/CD -> devops
- Database / performance -> performance-optimizer
- Git operations / worktree / commit / merge / push -> gitops
- After ANY worktree agent completes -> gitops (commit + merge + push)
- Multi-agent coordination / dynamic task decomposition -> coordinator
- Default -> analyst

---

## Key Rules

1. **Files < 500 lines** - Refactor if approaching limit
2. **Types in types/index.ts** - Centralized TypeScript types
3. **Validate before commit** - `__CLAUDE_HOME_TEST_FRONTEND_CMD__` (frontend) / `__CLAUDE_HOME_TEST_BACKEND_CMD__` (backend)
4. **tech-writer owns docs** - Only tech-writer modifies README/CHANGELOG
5. **developer owns code** - Only developer modifies source files

---

## Delegation Format

Use Task tool with subagent_type parameter:

```python
Task(
    subagent_type="developer",
    prompt="Update Button.tsx to add onClick handler",
    description="Add click handler"
)
```

**Available subagent_type values:**
- analyst, architect, researcher, developer
- debugger, reviewer, performance-optimizer, tech-writer, devops, gitops, coordinator

---

## Worktree Delegation Protocol

**CRITICAL: When spawning agents in worktrees (`isolation: "worktree"`), the orchestrator MUST follow this sequence:**

1. **Spawn developer/architect** in worktree — they write code and run tests. They do NOT commit.
2. **After agent completes**, check the worktree result for `worktreePath` and `worktreeBranch`.
3. **Spawn gitops** (NOT in worktree) to commit + merge + push:
   ```
   Agent(subagent_type="gitops", prompt="
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

Spec-driven development when `__CLAUDE_HOME_SCHEMAS_DIR__` is initialized.

**CRITICAL:** `conversation_id` MUST be a UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). NEVER use human-readable names. Path: `.scaffolding/conversations/{UUID}/specs/`. If no CONVERSATION_ID provided, generate one with `uuidgen`.

---

## MCP Tools (optional)

If MCP servers are configured (`.mcp.json`), agents may use `mcp__*` tools for semantic memory and code quality analysis. If no MCP server is available, skip these instructions and work without them -- every agent has file-based memory as fallback (`.scaffolding/agent-memory/`).
