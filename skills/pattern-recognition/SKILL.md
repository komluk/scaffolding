---
name: pattern-recognition
description: "Identify and apply existing codebase patterns for consistency. TRIGGER when: writing new code that should match conventions, or reviewing code for pattern drift. SKIP: language-specific patterns (use python-patterns or react-patterns); security review (use security-review-checklists)."
---

# Pattern Recognition Skill

Standards for identifying and applying existing codebase patterns to maintain consistency.

## When to Apply

- Before writing new code
- When implementing similar features
- Code review for pattern consistency
- Refactoring decisions

---

## Pattern Detection Process

### Step 1: Scan Existing Code
| Action | Purpose |
|--------|---------|
| Find similar modules/components | Match structure and naming |
| Find similar functions/hooks | Match return types and patterns |
| Find similar services | Match error handling and API patterns |
| Check shared-types location | Match how the project centralizes types |

### Step 2: Extract Patterns
| Element | What to Look For |
|---------|------------------|
| Module/component structure | Imports, signature, body order |
| State management | Local-vs-shared state decisions |
| Error handling | Try/catch style, error messages |
| Naming conventions | Files, functions, types |
| File organization | Directory structure |

### Step 3: Apply Consistently
| Rule | Description |
|------|-------------|
| Match existing style | New code follows established patterns |
| Document deviations | If pattern changes, document why |
| Refactor if needed | Update old code to match new pattern |

---

## Example: React + TypeScript conventions (illustrative)

> Illustrative — the naming, component, hook, service, and type conventions below
> are one team's React/TypeScript catalog shown as a concrete example. The
> reusable skill is the *process* above (scan → extract → apply existing
> conventions). Substitute your stack's actual conventions; the value of this
> skill is matching whatever your codebase already does, not adopting these
> specific rules.

## Naming Conventions

### File Naming
| Type | Convention | Example |
|------|------------|---------|
| Component | PascalCase | `AnnotationCard.tsx` |
| Hook | camelCase with use | `useVisualization.ts` |
| Service | camelCase | `apiService.ts` |
| Types | camelCase or index | `types/index.ts` |
| Store | camelCase with Store | `projectStore.ts` |
| Utility | camelCase | `formatters.ts` |

### Code Naming
| Type | Convention | Example |
|------|------------|---------|
| Component | PascalCase | `AnnotationCard` |
| Function | camelCase verb | `fetchProjects`, `handleClick` |
| Hook | camelCase with use | `useVisualization` |
| Type/Interface | PascalCase | `ProjectType`, `ButtonProps` |
| Constant | UPPER_SNAKE | `API_BASE_URL`, `MAX_SIZE` |
| Variable | camelCase | `isLoading`, `userName` |

---

## Component Patterns

### Standard Component Structure
| Section | Order | Required |
|---------|-------|----------|
| Imports | 1st | Yes |
| Props interface | 2nd | Yes |
| Component function | 3rd | Yes |
| Hooks declarations | Inside, top | Yes |
| Event handlers | Inside, after hooks | As needed |
| Return JSX | Inside, last | Yes |

### Component Organization by Type
| Type | Location | Purpose |
|------|----------|---------|
| Page components | `pages/` | Route entry points |
| Feature components | `components/[feature]/` | Feature-specific UI |
| Common components | `components/common/` | Reusable across features |
| Layout components | `components/layout/` | Page structure |

---

## Hook Patterns

### Custom Hook Standards
| Element | Requirement |
|---------|-------------|
| Name | `use` prefix + descriptive name |
| Return | Object with named values |
| State | `data`, `loading`, `error` pattern |
| Dependencies | All external values in dependency array |

### Hook Return Pattern
| Return Type | Use Case |
|-------------|----------|
| `{ data, loading, error }` | Data fetching hooks |
| `{ value, setValue, reset }` | Form/input hooks |
| `{ isOpen, open, close, toggle }` | Toggle hooks |

---

## Service Patterns

### API Service Standards
| Element | Requirement |
|---------|-------------|
| Async/await | All API calls use async/await |
| Error handling | Try/catch with console.error |
| Error format | `[ServiceName] Error description:` |
| Return type | Promise with typed response |

### Error Handling Pattern
| Element | Standard |
|---------|----------|
| Log format | `console.error('[Context] Message:', error)` |
| User message | Generic, no technical details |
| Rethrow | After logging for upstream handling |

---

## Type Patterns

### Type Location Rules
| Rule | Description |
|------|-------------|
| Centralized | All shared types in `types/index.ts` |
| Import style | Use `import type` for type-only imports |
| Export style | Use `export type` for type exports |
| No interfaces | Prefer `type` over `interface` for consistency |

### Type Naming
| Category | Pattern | Example |
|----------|---------|---------|
| Entity | `[Entity]Type` | `ProjectType`, `UserType` |
| Props | `[Component]Props` | `ButtonProps`, `CardProps` |
| State | `[Domain]State` | `ProjectState`, `UIState` |
| API Response | `[Endpoint]Response` | `ProjectsResponse` |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Props drilling | Hard to maintain | Use a shared store or context |
| Large components | Hard to test/read | Extract sub-components |
| Inline styles | Inconsistent | Use your styling system's tokens |
| `any` type | Loses type safety | Define proper types |
| Barrel exports | Circular dependencies | Use direct imports |
| Mixed conventions | Confusing | Follow established patterns |

---

## Code Reuse Protocol

The universal rule: **before writing ANY new utility, grep the codebase for an
existing one.** Map your project's shared modules and reuse them instead of
creating parallel helpers, exception hierarchies, or clients.

### Example: a backend `core/` layout (illustrative)

> Illustrative — one team's shared-module layout. Substitute your project's
> actual shared modules. The reusable rule is "search before you create".

| Module | Contains | Example |
|--------|----------|---------|
| `core/utils/` | datetime, validation, paths, formatters, file, language | `utc_now()`, `validate_uuid()`, `ensure_dir()` |
| `core/exceptions.py` | Base exceptions: AppError, NotFoundError, CreationError, GitHubError | Inherit, don't create parallel hierarchies |
| `core/http_client.py` | Singleton async HTTP client with connection pooling | `get_http_client()` for all HTTP calls |
| `core/config.py` | App configuration and settings | Centralized env var access |
| `*/service.py` | Domain service layer | Match existing service patterns |
| `*/schemas.py` | Validation models per domain | Follow existing schema structure |

### Rules
1. **Grep before creating** - Search shared modules for an existing function before writing a new one
2. **Inherit base exceptions** - New domain errors must extend the project's base error type
3. **Use shared clients** - Reuse the project's shared HTTP/DB client, never spin up a new one ad hoc
4. **Follow service pattern** - New services should match the structure of existing services

---

## Pattern Compliance Checklist

### Before Submitting Code
- [ ] Follows existing component structure
- [ ] Uses established naming conventions
- [ ] Types defined in types/index.ts
- [ ] Error handling matches project style
- [ ] Uses `import type` where appropriate
- [ ] File location matches pattern
- [ ] Hooks follow return pattern
- [ ] Services follow error handling pattern

---

## Pattern Documentation

### When to Document New Pattern
| Situation | Action |
|-----------|--------|
| New architectural decision | Document in ADR |
| Repeated pattern emerges | Add to skill documentation |
| Pattern deviation needed | Document reason in code comment |
| Breaking change | Update all related documentation |
