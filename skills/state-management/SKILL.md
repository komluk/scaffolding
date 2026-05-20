---
name: state-management
description: "Zustand-based global state standards. TRIGGER when: creating a store, managing global state, or deciding local vs global state. SKIP: component/hook structure (use react-patterns); visual styling (use mui-styling)."
---

# State Management Skill

Zustand-based state management standards and best practices.

## When to Apply

- Creating new state stores
- Sharing state between components
- State architecture decisions
- Performance optimization for state

---

## State Category Guidelines

| Category | Solution | Use When |
|----------|----------|----------|
| Local UI | `useState` | Single component, simple state |
| Shared UI | Zustand store | Multiple components need same data |
| Server data | React Query / SWR | API data with caching needs |
| Form state | `useState` / form library | Form inputs, validation |
| URL state | `useSearchParams` | Filter/sort params, shareable URLs |

---

## Zustand Store Standards

### Store Structure
| Element | Requirement |
|---------|-------------|
| Interface | Define typed state + actions interface |
| State | Group related state together |
| Actions | Define all mutations as functions |
| Naming | `use[Domain]Store` convention |

### Store Design Principles
| Principle | Description |
|-----------|-------------|
| Single responsibility | One store per domain (projects, UI, settings) |
| Flat structure | Avoid deeply nested state |
| Immutable updates | Always return new objects |
| Colocated actions | Keep actions inside store definition |

---

## Selector Best Practices

### Selection Rules
| Rule | Reason |
|------|--------|
| Select minimal data | Reduces re-renders |
| Use `shallow` for objects | Prevents unnecessary updates |
| Memoize derived data | Use `useMemo` for computed values |
| Avoid selecting entire store | Causes re-render on any change |

### Selector Patterns
| Pattern | Use Case |
|---------|----------|
| Single value | `(state) => state.count` |
| Multiple values | `(state) => ({ a: state.a, b: state.b }), shallow` |
| Derived value | `useMemo` outside store |

---

## Middleware Usage

| Middleware | Purpose | When to Use |
|------------|---------|-------------|
| `persist` | LocalStorage persistence | User preferences, settings |
| `devtools` | Redux DevTools integration | Development debugging |
| `immer` | Immutable updates | Complex nested state |
| `subscribeWithSelector` | Granular subscriptions | Performance optimization |

---

## Store Organization

### File Structure
```
src/stores/
├── index.ts           # Re-exports all stores
├── projectStore.ts    # Domain-specific store
├── uiStore.ts         # UI state (modals, panels)
└── settingsStore.ts   # User preferences
```

### Store Separation Guidelines
| Store Type | Contains |
|------------|----------|
| Domain store | Business entities, selections |
| UI store | Modal states, panel visibility, loading |
| Settings store | User preferences, persisted config |

---

## Performance Guidelines

### DO
- Select only needed state slices
- Use `shallow` equality for object selections
- Define actions inside store (stable references)
- Split large stores by domain
- Use `subscribeWithSelector` for side effects

### DON'T
- Select entire store object
- Create new objects in selectors without `shallow`
- Put derived/computed state in store
- Call actions during render phase
- Create deeply nested store structure

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Giant store | Hard to maintain, performance issues | Split by domain |
| Computed in store | Stale data, extra complexity | Use `useMemo` |
| Prop drilling | Bypasses store benefits | Use store directly |
| Store in useState | Loses reactivity | Use store hook |
| No TypeScript | Runtime errors | Define interfaces |

---

## Decision Matrix

| Scenario | Recommended Solution |
|----------|---------------------|
| Form input state | `useState` |
| Modal open/close | `useState` or UI store |
| Selected item (shared) | Domain store |
| User preferences | Persisted store |
| API response data | Store + service function |
| Computed/derived data | `useMemo` from store values |
| Global loading state | UI store |

---

## Project Store Patterns

### Store Files (`src/stores/`)

| Store | Persist | Purpose |
|-------|---------|---------|
| `workspaceStore.ts` | Yes (`scaffolding-workspaces`) | Projects/workspaces, active selection |
| `taskStore.ts` | No | Task CRUD, SSE updates, agent statuses |
| `authStore.ts` | Yes (`auth-storage`) | GitHub OAuth state, user profile |

### Type Pattern: Separate State & Actions

Every store defines `type XxxState` and `type XxxActions`, then exports the combined type:
```typescript
type WorkspaceState = {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
};
type WorkspaceActions = {
  addWorkspace: (pathOrWorkspace: string | Workspace) => void;
  removeWorkspace: (path: string) => Promise<void>;
  setActiveWorkspace: (path: string) => void;
  loadFromApi: () => Promise<void>;
};
export type WorkspaceStore = WorkspaceState & WorkspaceActions;
```

### Persist Middleware with `partialize`

Persisted stores use `partialize` to exclude actions and transient state from storage:
```typescript
export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({ /* state + actions */ }),
    {
      name: 'scaffolding-workspaces',
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspace: state.activeWorkspace,
      }),
    }
  )
);
```

### Hook Wrappers with `useShallow` (`src/hooks/`)

Stores are consumed through hook wrappers that use `useShallow` to prevent re-renders:
```typescript
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useShallow } from 'zustand/shallow';

export function useWorkspace() {
  return useWorkspaceStore(
    useShallow((state) => ({
      workspaces: state.workspaces,
      activeWorkspace: state.activeWorkspace,
      addWorkspace: state.addWorkspace,
      // ... selected fields only
    }))
  );
}
```

### API Sync Pattern (`loadFromApi`)

Stores hydrate from localStorage first, then enrich from API:
1. `persist` middleware loads cached state from localStorage on mount
2. `loadFromApi()` fetches from backend, merges fields (id, github_url, role) into existing entries
3. Failures are silently caught - localStorage data still works offline

### SSE Update Pattern (taskStore)

Non-persisted stores receive real-time updates from Server-Sent Events:
- `addTask(task)` - deduplicates before prepending to list
- `updateTask(task)` - replaces full task object in list and currentTask
- `updateTaskPartial(id, updates)` - merges partial fields from SSE completion events
- `updateAgentStatus(taskId, status)` - tracks per-agent progress within a task

### Error Handling in Stores

Stores use `extractErrorMessage(err, fallbackMsg)` utility and store errors in state:
```typescript
catch (err) {
  const message = extractErrorMessage(err, 'Failed to fetch tasks');
  set({ error: message, isLoading: false });
}
```

For expected errors (e.g., 409 conflict on cancel), check `AxiosError` status before setting error state.
