# Specialized Agents Overview

The agent system comprises **10 specialized agents** organized across three operational tiers.

## Command → Agent → Skill responsibility split

| Layer | Owns | Does NOT |
|-------|------|----------|
| **Command** | Arg parsing, UI/UX, sequencing agents, the final report | Domain logic or reusable methodology |
| **Agent** | Doing the work for one role; carrying its skills | Arg parsing or cross-agent sequencing |
| **Skill** | One reusable, auto-invokable methodology | Orchestrating agents or owning UI |

An agent **preloads** a skill via `skills:` frontmatter when it needs it on
nearly every task; otherwise the skill stays **invoked** on demand via its
`description:` `TRIGGER`/`SKIP`. Full decision rule:
`docs/orchestration-pattern.md`.

## Tier 1: Orchestration (1 Agent)

### architect
Master coordinator for complex, multi-faceted projects. Decomposes requirements into subtasks, designs architecture and APIs, coordinates multi-agent workflows. Also handles implementation planning: transforms ResearchPacks into executable implementation plans with minimal changes, reversibility, and clear steps.

**Triggers**: Complex features, refactoring, multi-file changes, architecture questions, task routing, API design, implementation planning
**Tools**: Read, Glob, Grep, Task, WebSearch
**Output**: Task breakdown, agent assignments, dependency graph, API specifications, ImplementationPlan with file list, steps, rollback strategy
**Quality Gate (planning)**: Score >= 85 to proceed to implementation

## Tier 2: Core Development (4 Agents)

### researcher
Retrieves accurate, version-specific documentation for APIs and libraries. Searches official docs, verifies accuracy, produces ResearchPacks with citations.

**Triggers**: New API integration, library questions, best practices lookup
**Tools**: WebSearch, WebFetch, Read, Glob, Grep
**Output**: ResearchPack with sources and confidence levels
**Quality Gate**: Score >= 80 to proceed to planning

### developer
Expert software engineer. Implements features, fixes bugs, writes all tests (unit, integration, E2E), implements UI/styling. Primary agent for all coding tasks.

**Triggers**: Implementation tasks, bug fixes, feature development, testing, UI/styling
**Tools**: Read, Edit, Write, Bash, Glob, Grep
**Output**: Working code, tests, validation results
**Quality Gate**: `npm run validate` or `pytest` passes

### debugger
Systematic root cause analysis for bugs and issues. Uses progressive debugging techniques from quick checks to deep analysis.

**Triggers**: Bug reports, unexpected behavior, errors
**Tools**: Read, Grep, Glob, Bash
**Output**: Root cause analysis, fix recommendations

### reviewer
Comprehensive code review and security specialist. Handles all review types: quality, security, performance, test coverage. Also performs threat modeling and compliance review.

**Triggers**: After code changes, before commit, security analysis, threat modeling
**Tools**: Read, Grep, Glob, Bash, WebSearch
**Output**: Review report with findings, security analysis, STRIDE assessment
**Commands**: /code-review, /security-review, /test-coverage

## Tier 3: Specialized (5 Agents)

### optimizer
Performance and database specialist. Handles profiling, benchmarking, query optimization, schema design, migrations, and bottleneck identification.

**Triggers**: Performance issues, database design, schema changes, migration planning, query optimization
**Tools**: Read, Grep, Glob, Bash
**Output**: Performance analysis, schema design, migration plan, optimization recommendations

### prompt-engineer
Prompt & guardrail engineering specialist. Designs system prompts and templates, guardrail rules, prompt eval suites, and LLM-judge rubrics; hardens against prompt injection.

**Triggers**: System-prompt design, prompt templates, guardrail rules, prompt evals, LLM-judge rubrics, injection defense
**Tools**: Read, Edit, Write, Grep, Glob, Bash
**Output**: Versioned prompts/guardrails, eval results, injection-defense report

### mcp-builder
MCP server specialist. Designs, builds, and tests MCP servers (stdio/http transports), tool schemas, and secret-safe launchers (Vault-launcher pattern).

**Triggers**: Build/modify MCP servers, tool schema design, transport choice, MCP auth/secret launchers
**Tools**: Read, Edit, Write, Bash, Grep, Glob
**Output**: MCP server implementation, tool schemas, smoke-test results

### tech-writer
Documentation owner. Manages ALL markdown files: README, CHANGELOG, docs/. Sole authority for documentation.

**Triggers**: Documentation updates, CHANGELOG entries
**Tools**: Read, Write, Edit, Grep, Glob
**Output**: Updated documentation files

### devops
CI/CD and infrastructure specialist. Manages pipelines, deployment, environment setup.

**Triggers**: CI/CD changes, deployment, infrastructure
**Tools**: Bash, Read, Write, Edit
**Output**: Pipeline configurations, deployment scripts

---

## Quality Gates

| Phase | Minimum Score | Blocks | Owner |
|-------|---------------|--------|-------|
| Research | 80+ | Planning | researcher |
| Planning | 85+ | Implementation | architect |
| Implementation | Validation pass | Commit | developer |
| Review | No critical issues | Merge | reviewer |

## Agent Selection Matrix

| Task Type | Primary Agent | Supporting Agents |
|-----------|---------------|-------------------|
| New feature (complex) | architect | researcher → architect (plan) → developer → reviewer → tech-writer |
| New feature (simple) | developer | reviewer |
| Bug fix | debugger | developer → reviewer |
| Refactoring | architect | architect (plan) → developer → reviewer |
| Performance issue | optimizer | developer |
| Database design | optimizer | developer |
| API design | architect | developer |
| Security review | reviewer | - |
| Threat modeling | reviewer | - |
| Documentation | tech-writer | - |
| UI/Styling | developer | reviewer |
| All testing | developer | reviewer |
| Code review | reviewer | - |
| Research | researcher | - |
| CI/CD | devops | - |
| Prompt / guardrail / eval | prompt-engineer | reviewer |
| MCP server build | mcp-builder | reviewer |

## Files

| Agent | File |
|-------|------|
| architect | .claude/agents/architect.md |
| researcher | .claude/agents/researcher.md |
| developer | .claude/agents/developer.md |
| debugger | .claude/agents/debugger.md |
| reviewer | .claude/agents/reviewer.md |
| optimizer | .claude/agents/optimizer.md |
| prompt-engineer | .claude/agents/prompt-engineer.md |
| mcp-builder | .claude/agents/mcp-builder.md |
| tech-writer | .claude/agents/tech-writer.md |
| devops | .claude/agents/devops.md |
