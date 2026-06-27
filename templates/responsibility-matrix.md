# Agent Responsibility Matrix

Clear ownership assignments to prevent overlap and confusion.

## Quality Gates

| Rule | Threshold | Enforced By |
|------|-----------|-------------|
| File size | < 500 lines | architect (design), reviewer (check) |
| Types location | types/index.ts | architect (design), reviewer (check) |
| Validation | npm run validate / pytest | developer (run), reviewer (verify) |
| Research quality | Score >= 80 | architect (gate) |
| Plan quality | Score >= 85 | developer (gate) |

---

## Testing Responsibilities

| Task | Owner |
|------|-------|
| Test strategy | developer |
| Unit tests | developer |
| Integration tests | developer |
| E2E tests | developer |
| Performance testing | optimizer |
| Test adequacy check | reviewer |

---

## Documentation Responsibilities

| Artifact | Owner |
|----------|-------|
| README.md | tech-writer |
| CHANGELOG.md | tech-writer |
| docs/ folder | tech-writer |
| API documentation (OpenAPI) | architect → tech-writer |
| Code comments / JSDoc | developer |
| Architecture Decision Records | architect |

---

## Code Review Responsibilities

| Focus Area | Owner |
|------------|-------|
| Security review | reviewer |
| Threat modeling | reviewer |
| Performance review | reviewer |
| Code quality review | reviewer |
| Architecture review | architect |
| Test coverage review | reviewer |
| Compliance review | reviewer |

---

## Specialized Domains

### Database & Performance

| Task | Owner |
|------|-------|
| Schema design | optimizer |
| Migration planning | optimizer |
| Query optimization | optimizer |
| Performance analysis | optimizer |
| Bottleneck identification | optimizer |
| Implementation | developer |

### API

| Task | Owner |
|------|-------|
| API design | architect |
| OpenAPI specification | architect |
| Versioning strategy | architect |
| Endpoint implementation | developer |

### Security

| Task | Owner |
|------|-------|
| Threat modeling | reviewer |
| Security architecture | reviewer |
| Auth strategy design | reviewer |
| Security code review | reviewer |
| Security implementation | developer |

### UI/UX

| Task | Owner |
|------|-------|
| Design decisions | developer |
| Component styling | developer |
| Accessibility | developer |

---

## Planning & Orchestration

| Task | Owner |
|------|-------|
| Task routing | architect |
| Complex task decomposition | architect |
| Architecture design | architect |
| API design | architect |
| Implementation planning | architect |
| Research | researcher |

---

## Research & Planning Chain

```
researcher → architect (plan) → developer
       ↓                ↓                 ↓
   ResearchPack   ImplementationPlan   Working Code
   (score ≥80)      (score ≥85)      (validation pass)
```

---

## Bug Handling

| Task | Owner |
|------|-------|
| Bug investigation | debugger |
| Bug fix implementation | developer |
| Bug verification | developer |
| Fix review | reviewer |

---

## CI/CD & Infrastructure

| Task | Owner |
|------|-------|
| Pipeline configuration | devops |
| Environment setup | devops |
| Deployment | devops |
| Docker configuration | devops |

---

## Summary: All 10 Agents

| Agent | Primary Focus | Does NOT Do |
|-------|---------------|-------------|
| **architect** | Task routing, orchestration, architecture, API design, implementation planning | Code changes |
| **researcher** | Documentation research | Planning, coding |
| **developer** | Write code, all tests, UI/styling | Docs, architecture |
| **debugger** | Root cause analysis | Fix implementation |
| **reviewer** | All reviews, security, threat modeling | Writing code |
| **optimizer** | Performance, database design, queries | Code changes |
| **prompt-engineer** | System prompts, guardrails, prompt evals, LLM-judge rubrics | General app code, library research |
| **mcp-builder** | MCP servers, tool schemas, transports, secret launchers | Library research, generic CI/CD |
| **tech-writer** | All documentation | Code changes |
| **devops** | CI/CD, infrastructure | Feature implementation |

---

## Cross-Cutting Concerns Ownership

| Concern | Design Owner | Review Owner | Implementation |
|---------|--------------|--------------|----------------|
| Error handling | architect | reviewer | developer |
| Logging | architect | reviewer | developer |
| Security | reviewer | reviewer | developer |
| Performance | optimizer | reviewer | developer |
| Database | optimizer | reviewer | developer |
| API design | architect | reviewer | developer |

---

## Conflict Resolution

When agents disagree:
1. **Architecture vs Performance**: architect decides, optimizer advises
2. **Security vs Usability**: reviewer decides with user input
3. **Speed vs Quality**: reviewer enforces quality gates
