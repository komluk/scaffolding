---
name: testing-strategy
description: "Test pyramid, coverage targets, and pytest/vitest patterns. TRIGGER when: planning tests, writing test code, or reviewing coverage. SKIP: quality-gate scoring of plans (use quality-validation); security testing (use security-review-checklists)."
---

# Testing Strategy Skill

## Purpose
Comprehensive testing guidelines including test pyramid, coverage targets, and test patterns.

## Auto-Invoke Triggers
- Planning test strategy
- Writing unit/integration tests
- Reviewing test coverage
- Setting up test infrastructure

---

## Test Pyramid

```
        /\
       /  \      E2E Tests (10%)
      /----\     - Critical user flows
     /      \    - Slow, expensive
    /--------\   Integration Tests (20%)
   /          \  - API tests, DB tests
  /------------\ - Medium speed
 /              \ Unit Tests (70%)
/----------------\ - Fast, isolated
                   - Business logic
```

### Distribution Guidelines
| Type | Percentage | Focus |
|------|------------|-------|
| Unit | 70% | Business logic, utilities |
| Integration | 20% | API, database, services |
| E2E | 10% | Critical user journeys |

---

## Coverage Targets

| Metric | Minimum | Target |
|--------|---------|--------|
| Line coverage | 70% | 80% |
| Branch coverage | 60% | 70% |
| Critical paths | 90% | 100% |

### What to Cover
- All public methods
- Business logic
- Edge cases
- Error handling
- Integration points

### What NOT to Cover
- Generated code
- Simple getters/setters
- Framework code
- Third-party libraries

---

## Unit Testing

### Principles
- Test one thing per test
- Tests should be fast (< 100ms)
- Tests should be isolated
- Tests should be deterministic
- No external dependencies

### AAA Pattern
```
Arrange - Set up test data and mocks
Act     - Execute the method under test
Assert  - Verify the expected outcome
```

### Naming Convention
```
{Method}_{Scenario}_{ExpectedResult}

CreateUser_ValidData_ReturnsUserId
CreateUser_DuplicateEmail_ThrowsConflict
CalculateTotal_EmptyCart_ReturnsZero
```

### Test Categories
| Category | Purpose | Example |
|----------|---------|---------|
| Happy path | Normal operation | Valid user creation |
| Edge case | Boundary conditions | Empty input, max length |
| Error case | Failure scenarios | Invalid data, not found |

---

## Integration Testing

### Scope
- API endpoints
- Database operations
- External service calls
- Message queues

### Best Practices
- Use test containers or in-memory DB
- Seed known test data
- Clean up after each test
- Mock external services
- Test full request/response cycle

### API Test Checklist
- [ ] Correct status code
- [ ] Response body structure
- [ ] Headers (content-type, auth)
- [ ] Validation errors
- [ ] Authorization rules

---

## E2E Testing

### When to Use
- Critical user journeys
- Payment flows
- Authentication flows
- Multi-step workflows

### Best Practices
- Test user perspective, not implementation
- Use stable selectors (data-testid)
- Handle async operations properly
- Keep tests independent
- Use page object pattern

### Critical Paths to Test
- User registration/login
- Main feature workflow
- Payment/checkout
- Error recovery flows

---

## Test Data Management

### Strategies
| Strategy | Use Case |
|----------|----------|
| Fixtures | Static test data |
| Factories | Dynamic test data |
| Builders | Complex objects |
| Seeders | Database state |

### Rules
- Use realistic but fake data
- Never use production data
- Reset state between tests
- Use faker libraries for variety

---

## Mocking Guidelines

### When to Mock
- External services (APIs, databases)
- Time-dependent operations
- Random values
- Expensive operations

### When NOT to Mock
- Simple value objects
- The code under test
- Everything (over-mocking)

### Mock Types
| Type | Purpose |
|------|---------|
| Stub | Return canned responses |
| Mock | Verify interactions |
| Spy | Record calls, pass through |
| Fake | Simplified implementation |

---

## Test Organization

### File Structure
```
tests/
├── unit/
│   ├── services/
│   └── utils/
├── integration/
│   ├── api/
│   └── db/
├── e2e/
├── fixtures/
└── conftest.py / setup.ts
```

### Naming
- Test files: `{module}_test.py` or `{module}.test.ts`
- Match source structure
- Group related tests in describe/class

---

## CI/CD Integration

### Pipeline Stages
1. **Unit tests** - Run on every commit
2. **Integration tests** - Run on PR/merge
3. **E2E tests** - Run on deploy to staging

### Quality Gates
| Gate | Requirement |
|------|-------------|
| Unit tests | 100% pass |
| Coverage | > 70% |
| Integration | 100% pass |
| E2E (critical) | 100% pass |

---

## Performance Testing

### Types
| Type | Purpose |
|------|---------|
| Load | Expected traffic |
| Stress | Breaking point |
| Soak | Memory leaks |
| Spike | Sudden traffic |

### Metrics to Measure
- Response time (p50, p95, p99)
- Throughput (requests/second)
- Error rate
- Resource usage

---

## Best Practices

### DO
- Write tests before fixing bugs
- Test behavior, not implementation
- Keep tests simple and readable
- Run tests frequently
- Maintain test code quality
- Use meaningful assertions

### DON'T
- Test private methods directly
- Write flaky tests
- Skip tests temporarily (delete instead)
- Test external systems
- Ignore slow tests
- Copy-paste test code

---

## Test Quality Checklist

- [ ] Tests are fast (< 10s for unit suite)
- [ ] Tests are isolated (no order dependency)
- [ ] Tests are deterministic (no flakiness)
- [ ] Tests are readable (clear intent)
- [ ] Tests cover edge cases
- [ ] Tests verify error handling
- [ ] Mocks are minimal and purposeful
- [ ] CI runs tests automatically
