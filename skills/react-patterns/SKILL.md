---
name: react-patterns
description: "React 18 + TypeScript component and hook standards. TRIGGER when: creating components, custom hooks, or reviewing React code. SKIP: visual styling and theme tokens (use mui-styling); global store design (use state-management)."
---

# React Patterns Skill

React 18 + TypeScript standards and best practices.

## When to Apply

- Creating new React components
- Implementing custom hooks
- State management decisions
- Performance optimization
- Code review for React code

---

## Component Standards

### Component Structure Rules
| Rule | Description |
|------|-------------|
| Functional only | Use function components, no class components |
| TypeScript props | Define Props interface for all components |
| Single responsibility | One component = one purpose |
| Max 200 lines | Split larger components into sub-components |

### Component Organization
| Section | Order |
|---------|-------|
| 1. Imports | Types first, then libraries, then local |
| 2. Props interface | Define before component |
| 3. Hooks | All hooks at top of function |
| 4. Handlers | Event handlers after hooks |
| 5. Effects | useEffect after handlers |
| 6. Return | JSX at the end |

---

## Hook Standards

### Built-in Hooks Usage
| Hook | Use When | Avoid When |
|------|----------|------------|
| `useState` | Local component state | Shared state (use Zustand) |
| `useEffect` | Side effects, subscriptions | Derived state (use `useMemo`) |
| `useMemo` | Expensive calculations | Simple values |
| `useCallback` | Callbacks passed to children | Inline handlers |
| `useRef` | DOM refs, mutable values | State that triggers renders |

### Custom Hook Guidelines
| Guideline | Description |
|-----------|-------------|
| Prefix with `use` | `useFeatureName`, `useDataFetching` |
| Return object | `{ data, loading, error }` |
| Single responsibility | One hook = one purpose |
| Reusable | Extract when logic repeats 2+ times |

---

## TypeScript Requirements

### Type Import Rules
| Rule | Example |
|------|---------|
| Use `import type` | `import type { Props } from './types'` |
| Use `export type` | `export type { ButtonProps }` |
| Centralize types | All types in `types/index.ts` |
| No `any` | Use `unknown` or proper types |

### Props Typing Standards
| Standard | Description |
|----------|-------------|
| Interface for props | `interface Props { ... }` |
| Optional with `?` | `title?: string` |
| Children explicit | `children: React.ReactNode` |
| Events typed | `onClick: (e: React.MouseEvent) => void` |

---

## Performance Standards

### Memoization Guidelines
| Technique | When to Use |
|-----------|-------------|
| `useMemo` | Expensive calculations, derived data |
| `useCallback` | Functions passed as props to memoized children |
| `React.memo` | Components with same props render same output |

### Re-render Prevention
| Cause | Solution |
|-------|----------|
| New object in props | Memoize with `useMemo` |
| New function in props | Memoize with `useCallback` |
| Context changes | Split contexts by update frequency |
| Parent re-renders | Use `React.memo` on child |

---

## Effect Guidelines

### useEffect Rules
| Rule | Description |
|------|-------------|
| Cleanup required | Return cleanup function for subscriptions |
| Dependency array | Include all referenced values |
| Avoid objects in deps | Use primitive values or `useMemo` |
| No async directly | Define async function inside effect |

### Common Effect Patterns
| Pattern | Use Case |
|---------|----------|
| Data fetching | Fetch on mount or dependency change |
| Subscription | Event listeners, WebSocket |
| DOM measurement | Read layout after render |
| Sync external | Sync state with external system |

---

## Event Handling Standards

### Event Handler Naming
| Pattern | Example |
|---------|---------|
| Action verb | `handleClick`, `handleSubmit` |
| Specific action | `handleDeleteItem`, `handleToggleMenu` |
| Props callback | `onAction`, `onChange` |

### Event Types
| Event | Type |
|-------|------|
| Click | `React.MouseEvent<HTMLButtonElement>` |
| Change | `React.ChangeEvent<HTMLInputElement>` |
| Submit | `React.FormEvent<HTMLFormElement>` |
| Keyboard | `React.KeyboardEvent` |

---

## File Organization

### Directory Structure
```
src/
├── components/
│   ├── common/          # Shared/reusable components
│   ├── [feature]/       # Feature-specific components
│   └── layout/          # Layout components
├── hooks/
│   └── use[Name].ts     # Custom hooks
├── pages/
│   └── [Page].tsx       # Route pages
├── services/
│   └── [name]Service.ts # API services
├── stores/
│   └── [name]Store.ts   # Zustand stores
└── types/
    └── index.ts         # All type definitions
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| useEffect for derived state | Extra renders | Use `useMemo` |
| Missing dependencies | Stale closures, bugs | Add all deps |
| Index as key | Bugs on reorder | Use unique id |
| Prop drilling > 2 levels | Hard to maintain | Use Context/Zustand |
| Inline object props | New reference each render | Memoize or extract |
| State for constants | Unnecessary complexity | Define outside component |

---

## Code Review Checklist

### Component Review
- [ ] Single responsibility principle followed
- [ ] Props interface defined with TypeScript
- [ ] No prop drilling beyond 2 levels
- [ ] Hooks at top level only
- [ ] Cleanup in useEffect where needed

### Performance Review
- [ ] Expensive calculations memoized
- [ ] Callbacks memoized when passed to children
- [ ] No new objects/arrays created in render
- [ ] Keys are unique and stable

### TypeScript Review
- [ ] `import type` used for type imports
- [ ] No `any` types
- [ ] Props properly typed
- [ ] Event handlers typed
