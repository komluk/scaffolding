---
name: github-actions-template
description: "GitHub Actions CI pipeline templates and workflow YAML patterns. TRIGGER when: creating or editing a CI workflow, adding a CI job, or wiring build/test/deploy steps. SKIP: container build internals (use docker-templates); local git workflow (use git-operations)."
---

## Standard CI Pipeline

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test

  build:
    runs-on: ubuntu-latest
    needs: [lint, type-check, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/
```

## Pipeline Stages

| Stage | Purpose | Failure Action |
|-------|---------|----------------|
| Lint | Code style enforcement | Block merge |
| Type-check | TypeScript validation | Block merge |
| Test | Unit/integration tests | Block merge |
| Build | Production build | Block merge |
| Deploy (staging) | Preview deployment | Warn only |
| Deploy (prod) | Production release | Manual approval |

## Environment Management

| Environment | Branch | Auto-deploy | Approval |
|-------------|--------|-------------|----------|
| Development | feature/* | No | None |
| Staging | develop | Yes | None |
| Production | main | Yes | Required |

## Secrets Management

```yaml
# GitHub Secrets (never in code)
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  API_KEY: ${{ secrets.API_KEY }}

# Environment files (local only)
# .env.local - Never committed
# .env.example - Template only, no real values
```

## Deployment Strategies

| Strategy | Use When | Rollback |
|----------|----------|----------|
| Blue-Green | Zero downtime critical | Switch back to previous env |
| Canary | Risk mitigation, gradual rollout | Route 100% to old version |
| Rolling | Resource constrained, stateless apps | Slower, redeploy previous |

## Rollback Triggers

Automated rollback when:
- Health check failures after deploy
- Error rate spike > 5%
- Response time degradation
- Memory/CPU threshold breach

Requirements: Keep N-1 version deployable, backward-compatible DB migrations, feature flags for risky changes.

## Quality Gates

| Stage | Threshold |
|-------|-----------|
| Unit tests | 100% pass, > 70% coverage |
| Lint/Format | Zero errors |
| Security scan | No critical vulnerabilities |
| Build | Compiles without errors |

## Pipeline Optimization Targets

| Stage | Target Time |
|-------|-------------|
| Build | < 5 min |
| Unit tests | < 5 min |
| Integration tests | < 10 min |
| Full pipeline | < 30 min |

Parallelize independent stages. Cache dependencies. Use incremental builds.

## Bundled References

Usable workflow templates in `references/` based on actual project CI:

| File | Description |
|------|-------------|
| `references/ci-template.yml` | Full CI pipeline with path filtering, backend (Python) + frontend (TS), SonarQube |

Template uses self-hosted runner, `dorny/paths-filter` for conditional jobs, and artifact uploads for coverage. Adapt paths and language versions for new projects.
