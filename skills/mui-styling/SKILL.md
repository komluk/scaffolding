---
name: mui-styling
description: "Material-UI styling with the project neon cyberpunk theme. TRIGGER when: styling React components, defining theme tokens, or applying componentStyles. SKIP: component logic and hooks (use react-patterns); cross-stack UX/design decisions (use ui-ux-pro-max)."
---

# MUI Styling Skill

Material-UI styling standards and best practices.

## When to Apply

- Creating styled components
- Implementing responsive design
- Theme customization
- UI consistency review

---

## Styling Approach Priority

| Priority | Approach | Use When |
|----------|----------|----------|
| 1st | `sx` prop | Most styling needs |
| 2nd | `styled()` API | Reusable styled components |
| 3rd | Theme overrides | Global component defaults |
| Avoid | Inline CSS / CSS files | Never use in MUI projects |

---

## Spacing System

### Spacing Scale
| Value | Pixels | Usage |
|-------|--------|-------|
| 0.5 | 4px | Tight spacing |
| 1 | 8px | Default small |
| 2 | 16px | Default medium |
| 3 | 24px | Section spacing |
| 4 | 32px | Large spacing |

### Spacing Props
| Prop | CSS Property |
|------|--------------|
| `m` | margin |
| `p` | padding |
| `mt`, `mr`, `mb`, `ml` | margin-top/right/bottom/left |
| `pt`, `pr`, `pb`, `pl` | padding-top/right/bottom/left |
| `mx`, `my` | margin x/y axis |
| `px`, `py` | padding x/y axis |
| `gap` | flex/grid gap |

---

## Color System

### Theme Colors
| Category | Values |
|----------|--------|
| Primary | `primary.main`, `primary.light`, `primary.dark`, `primary.contrastText` |
| Secondary | `secondary.main`, `secondary.light`, `secondary.dark` |
| Status | `error.main`, `warning.main`, `info.main`, `success.main` |
| Grey | `grey.100` through `grey.900` |
| Background | `background.default`, `background.paper` |
| Text | `text.primary`, `text.secondary`, `text.disabled` |

### Color Usage Guidelines
| Use Case | Color |
|----------|-------|
| Primary actions | `primary.main` |
| Secondary actions | `secondary.main` |
| Error states | `error.main` |
| Success feedback | `success.main` |
| Backgrounds | `background.paper` or `background.default` |
| Body text | `text.primary` |
| Helper text | `text.secondary` |

---

## Responsive Design

### Breakpoints
| Key | Min Width | Target |
|-----|-----------|--------|
| `xs` | 0px | Mobile phones |
| `sm` | 600px | Tablets portrait |
| `md` | 900px | Tablets landscape |
| `lg` | 1200px | Desktops |
| `xl` | 1536px | Large screens |

### Responsive Syntax
| Syntax | Description |
|--------|-------------|
| `{ xs: value }` | Mobile first, applies to xs and up |
| `{ sm: value }` | Applies to sm and up |
| Object syntax | `{ xs: '100%', sm: 400, md: 600 }` |

### Responsive Guidelines
| Guideline | Description |
|-----------|-------------|
| Mobile first | Start with `xs`, override for larger |
| Test all breakpoints | Verify layout at each breakpoint |
| Use relative units | Prefer `%`, `vh`, `vw` over fixed `px` |
| Hide/show elements | Use `display: { xs: 'none', md: 'block' }` |

---

## Layout Components

### Component Selection
| Component | Use When |
|-----------|----------|
| `Box` | Generic container, flexbox layouts |
| `Stack` | Vertical/horizontal lists with spacing |
| `Grid` | 12-column grid layouts |
| `Container` | Centered max-width wrapper |

### Flexbox with Box
| Property | Values |
|----------|--------|
| `display` | `'flex'`, `'inline-flex'` |
| `flexDirection` | `'row'`, `'column'` |
| `justifyContent` | `'flex-start'`, `'center'`, `'space-between'` |
| `alignItems` | `'flex-start'`, `'center'`, `'stretch'` |
| `gap` | Spacing value (1, 2, 3...) |

### Grid System
| Prop | Description |
|------|-------------|
| `container` | Defines grid container |
| `item` | Defines grid item |
| `xs`, `sm`, `md`, `lg` | Columns at breakpoint (1-12) |
| `spacing` | Gap between items |

---

## Typography Standards

### Variant Usage
| Variant | Use For |
|---------|---------|
| `h1` - `h6` | Headings (use semantic hierarchy) |
| `body1` | Primary body text |
| `body2` | Secondary body text |
| `caption` | Small helper text |
| `button` | Button text |

### Typography Guidelines
| Guideline | Description |
|-----------|-------------|
| Semantic hierarchy | h1 > h2 > h3 (don't skip levels) |
| Color for emphasis | Use `text.secondary` for less important |
| Consistent variants | Same content type = same variant |

---

## Component Styling Standards

### Button Styling
| Variant | Use When |
|---------|----------|
| `contained` | Primary actions |
| `outlined` | Secondary actions |
| `text` | Tertiary actions, links |

### Card Styling
| Element | Standard |
|---------|----------|
| Padding | `p: 2` or `p: 3` |
| Border radius | Use theme default |
| Shadow | Use theme shadows (1-24) |

### Form Styling
| Element | Standard |
|---------|----------|
| TextField | `fullWidth` for forms |
| Spacing | `Stack spacing={2}` between fields |
| Labels | Always provide `label` prop |

---

## Anti-Patterns

| Avoid | Use Instead |
|-------|-------------|
| Inline CSS objects | `sx` prop with theme values |
| `!important` | Increase specificity via `sx` |
| Fixed pixel values | `theme.spacing()` values |
| Hardcoded colors | `theme.palette` colors |
| CSS classes | `sx` prop or `styled()` |
| External CSS files | MUI styling system |

---

## Performance Guidelines

### DO
- Use `sx` prop for one-off styles
- Use `styled()` for reusable styled components
- Leverage theme values for consistency
- Use responsive object syntax

### DON'T
- Create inline style objects (new reference each render)
- Override theme styles unnecessarily
- Use CSS-in-JS libraries alongside MUI
- Nest `sx` props deeply

---

## Accessibility Standards

| Standard | Implementation |
|----------|----------------|
| Color contrast | Use theme colors (WCAG compliant) |
| Focus indicators | Don't remove, customize if needed |
| Touch targets | Minimum 44x44px for buttons |
| Semantic HTML | Use correct MUI component for purpose |

---

## Code Review Checklist

- [ ] Uses `sx` prop or `styled()`, not inline CSS
- [ ] Colors from theme palette
- [ ] Spacing from theme scale
- [ ] Responsive breakpoints applied
- [ ] No hardcoded pixel values
- [ ] Typography variants used correctly
- [ ] Accessibility standards met

---

## Project Theme Reference

### Theme: Neon Cyberpunk (Dark Mode Only)

Font: `"Ubuntu"` (UI), `"Ubuntu Mono"` (code/terminal). Theme at `src/theme/index.ts`.

### Color Palette (`src/theme/colors.ts`)

```typescript
colors.background.primary   // '#0D0D0D' - page background
colors.background.secondary // '#121212' - AppBar, Drawer
colors.background.surface   // '#1E1E1E' - cards, paper
colors.background.elevated  // '#252525' - hover states
colors.background.input     // '#1A1A1A' - text fields

colors.neon.cyan     // '#00FFFF' - primary actions, focus rings
colors.neon.lime     // '#39FF14' - secondary actions, success
colors.neon.red      // '#FF1744' - errors, danger
colors.neon.yellow   // '#FFEA00' - warnings
colors.neon.orange   // '#FF9100' - cancelled status
colors.neon.purple   // '#E040FB' - accents
colors.neon.green    // '#00E676' - success variant

colors.text.primary   // '#F0F0F0'
colors.text.secondary // '#888888'
colors.text.muted     // '#666666'
colors.border.primary // '#2A2A2A'
```

### Alpha Helpers (`src/theme/colors.ts`)
```typescript
alpha.cyan(0.08)   // hover backgrounds
alpha.cyan(0.16)   // selected backgrounds
alpha.red(0.1)     // error backgrounds
alpha.lime(0.1)    // success backgrounds
```

### Glow Effects (`src/theme/glows.ts`)
```typescript
glows.cyan         // '0 0 15px rgba(0,255,255,0.4)' - standard
glows.cyanLight    // '0 0 10px rgba(0,255,255,0.2)' - subtle (buttons, inputs)
glows.cyanStrong   // dual shadow for hover emphasis
glows.terminalInset// inset shadow for terminal containers
statusGlows[status]// per-TaskStatus glow effects
```

### componentStyles (`src/theme/componentStyles.ts`)

Pre-built `SxProps<Theme>` objects. Apply via spread in `sx` prop:
```tsx
import { componentStyles } from '../theme';

<Button sx={componentStyles.primaryButton}>Submit</Button>
<Button sx={componentStyles.dangerButton}>Delete</Button>
<IconButton sx={componentStyles.iconButtonDanger}>...</IconButton>
<TextField sx={componentStyles.textField} />
<Box sx={componentStyles.terminal}>output here</Box>
<Box sx={componentStyles.statusBadge('running')}>Running</Box>
<Alert sx={componentStyles.alertError}>Error msg</Alert>
<Typography sx={componentStyles.sectionHeader}>SECTION</Typography>
```

Available styles: `primaryButton`, `secondaryButton`, `dangerButton`, `ghostButton`, `iconButton`, `iconButtonDanger`, `iconButtonSuccess`, `iconButtonPrimary`, `selectorButtonSidebar`, `selectorButtonHeader`, `textField`, `textFieldSmall`, `dialog`, `terminal`, `statusBadge(status)`, `alertError`, `alertSuccess`, `dangerButtonContained`, `sectionHeader`, `menuHeader`, `scrollbar`, `alertBackendOffline`, `resizeHandle(isResizing)`, `liveBadge`, `collapsibleSection(expanded)`, `pulsingDot`.

### Animations (global keyframes in theme)
- `pulse` - opacity fade for running indicators
- `neonPulse` - scale+opacity for status dots
- `neonBlink` - cursor blink
- `liveGlow` - streaming indicator glow
- `subtleBgPulse` - running task row background

Usage: `animation: 'liveGlow 2s ease-in-out infinite'`

### Project Anti-Patterns
- Do NOT use raw hex colors - use `colors.*` tokens
- Do NOT write inline `boxShadow` - use `glows.*` presets
- Do NOT create new button styles - use `componentStyles.*Button`
- Do NOT hardcode font families - use `fonts.mono` / `fonts.monoExtended`
