# Skills Overview

Skills are auto-invoked capabilities that enhance agent effectiveness. They provide standardized methodologies and best practices.

## Command → Agent → Skill responsibility split

| Layer | Owns | Does NOT |
|-------|------|----------|
| **Command** | Arg parsing, UI/UX, sequencing agents, the final report | Domain logic or reusable methodology |
| **Agent** | Doing the work for one role; carrying its skills | Arg parsing or cross-agent sequencing |
| **Skill** | One reusable, auto-invokable methodology | Orchestrating agents or owning UI |

A skill is **preloaded** (in an agent's `skills:` frontmatter) when the agent
needs it on nearly every task, or **invoked** (auto-loaded via its
`description:` `TRIGGER`/`SKIP`) when it is situational. See
`docs/orchestration-pattern.md` for the full decision rule.

## Core Skills (5)

### research-methodology
Gathers authoritative documentation through systematic search.

**Process**: Rapid assessment → Official source retrieval → Organized findings with citations
**Quality Threshold**: Research score 80+
**Output**: ResearchPack with sources, recommendations

### planning-methodology
Transforms research into actionable implementation plans.

**Principles**: Simplicity, Surgical edits, Reversibility, Verification
**Quality Threshold**: Plan score 85+
**Output**: ImplementationPlan with files, steps, rollback

### quality-validation
Provides objective scoring for artifacts.

**Thresholds**: Research 80+, Planning 85+, Review no criticals
**Validation**: TypeScript, ESLint, Build, Tests

### pattern-recognition
Captures reusable patterns from successful implementations.

**Captures**: Code patterns, problem-solution pairs, architecture decisions

### context-engineering
Combats context degradation through active curation.

**Techniques**: Archive stale info, load relevant context, summarize conversations

---

## Frontend Skills (3)

### react-patterns
React 18 + TypeScript best practices.

**Enforces**: Functional components, custom hooks, `import type`, memoization

### mui-styling
Material-UI theming and component patterns.

**Covers**: Theme customization, `sx` prop, responsive breakpoints, accessibility

### state-management
Zustand and React state patterns.

**Patterns**: Store structure, selectors, persistence, DevTools

---

## Backend Skills (3)

### python-patterns
FastAPI + SQLAlchemy + Pydantic patterns.

**Covers**: Project structure, async patterns, repository pattern, dependency injection

### api-design
REST API design standards.

**Covers**: URL naming, HTTP methods, status codes, versioning, pagination, error format

### database-optimization
Database design, optimization, and migrations.

**Covers**: Schema design, migrations, indexing, query optimization, transactions

---

## Quality Skills (4)

### error-handling
Error handling standards across all layers.

**Covers**: Exception hierarchy, error response format, retry logic, circuit breaker

### security-review-checklists
Security guidelines and review checklists for all application layers.

**Covers**: OWASP top 10, input validation, authentication, authorization, secrets, review checklists

### logging-standards
Consistent logging across applications.

**Covers**: Log levels, structured logging, PII masking, what to log/not log

### testing-strategy
Comprehensive testing guidelines.

**Covers**: Test pyramid, coverage targets, unit/integration/E2E patterns

---

## Infrastructure Skills (3)

### github-actions-template
CI/CD pipeline templates and best practices.

**Covers**: Pipeline stages, quality gates, deployment strategies, rollback, GitHub Actions workflows

### docker-templates
Containerization templates and best practices.

**Covers**: Dockerfile optimization, multi-stage builds, security, compose, templates

### monitoring-observability
Monitoring and alerting standards.

**Covers**: Golden signals, metrics, alerting, distributed tracing, health checks

---

## Skill Invocation Flow

```
User Request → architect analyzes
                    ↓
            research-methodology (if needed)
                    ↓
            quality-validation (score check)
                    ↓
            planning-methodology
                    ↓
            quality-validation (score check)
                    ↓
            developer executes (with relevant skills)
                    ↓
            pattern-recognition captures
```

---

## Skills by Domain

| Domain | Skills |
|--------|--------|
| Research | research-methodology |
| Planning | planning-methodology, context-engineering |
| Quality | quality-validation, pattern-recognition |
| Frontend | react-patterns, mui-styling, state-management |
| Backend | python-patterns, api-design, database-optimization |
| Quality/Security | error-handling, security-review-checklists, logging-standards, testing-strategy |
| DevOps | github-actions-template, docker-templates, monitoring-observability |

---

## Skill Files

| Skill | Path |
|-------|------|
| research-methodology | .claude/skills/research-methodology/SKILL.md |
| planning-methodology | .claude/skills/planning-methodology/SKILL.md |
| quality-validation | .claude/skills/quality-validation/SKILL.md |
| pattern-recognition | .claude/skills/pattern-recognition/SKILL.md |
| context-engineering | .claude/skills/context-engineering/SKILL.md |
| react-patterns | .claude/skills/react-patterns/SKILL.md |
| mui-styling | .claude/skills/mui-styling/SKILL.md |
| state-management | .claude/skills/state-management/SKILL.md |
| python-patterns | .claude/skills/python-patterns/SKILL.md |
| api-design | .claude/skills/api-design/SKILL.md |
| database-optimization | .claude/skills/database-optimization/SKILL.md |
| error-handling | .claude/skills/error-handling/SKILL.md |
| security-review-checklists | .claude/skills/security-review-checklists/SKILL.md |
| logging-standards | .claude/skills/logging-standards/SKILL.md |
| testing-strategy | .claude/skills/testing-strategy/SKILL.md |
| github-actions-template | .claude/skills/github-actions-template/SKILL.md |
| docker-templates | .claude/skills/docker-templates/SKILL.md |
| monitoring-observability | .claude/skills/monitoring-observability/SKILL.md |
