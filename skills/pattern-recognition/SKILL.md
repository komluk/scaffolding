---
name: pattern-recognition
description: "Identify and apply existing codebase patterns for consistency. Use when writing new code to match established conventions in a project."
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
| Find similar components | Match structure and naming |
| Find similar hooks | Match return types and patterns |
| Find similar services | Match error handling and API patterns |
| Check types location | Ensure types/index.ts usage |

### Step 2: Extract Patterns
| Element | What to Look For |
|---------|------------------|
| Component structure | Props, hooks order, JSX structure |
| State management | Zustand vs useState decisions |
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
| Props drilling | Hard to maintain | Use Zustand or Context |
| Large components | Hard to test/read | Extract sub-components |
| Inline styles | Inconsistent | Use MUI sx prop |
| `any` type | Loses type safety | Define proper types |
| Barrel exports | Circular dependencies | Use direct imports |
| Mixed conventions | Confusing | Follow established patterns |

---

## Backend Code Reuse Protocol

Before writing ANY new backend utility, search these locations first:

| Module | Contains | Example |
|--------|----------|---------|
| `core/utils/` | datetime, validation, paths, formatters, file, language | `utc_now()`, `validate_uuid()`, `ensure_dir()` |
| `core/exceptions.py` | Base exceptions: AppError, NotFoundError, CreationError, GitHubError | Inherit, don't create parallel hierarchies |
| `core/http_client.py` | Singleton async httpx client with connection pooling | `get_http_client()` for all HTTP calls |
| `core/config.py` | App configuration and settings | Centralized env var access |
| `*/service.py` | Domain service layer (projects, users, sonarqube) | Match existing service patterns |
| `*/schemas.py` | Pydantic models per domain | Follow existing schema structure |

### Rules
1. **Grep before creating** - Search `core/` for existing function before writing a new one
2. **Inherit base exceptions** - New domain errors must extend `AppError` from `core/exceptions.py`
3. **Use shared HTTP client** - Import `get_http_client()` from `core/http_client.py`, never create new `httpx.AsyncClient`
4. **Follow service pattern** - New services should match structure of `projects/service.py` or `sonarqube/service.py`

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
