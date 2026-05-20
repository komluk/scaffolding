---
name: research-methodology
description: "Systematic gathering of accurate, version-specific documentation. TRIGGER when: researching a new API, library, or best practice before implementation. SKIP: turning findings into a plan (use planning-methodology); writing proposal.md (use spec-research)."
---

# Research Methodology Skill

Systematic approach for gathering accurate, version-specific documentation before implementation.

## Auto-Invoke Triggers

- Implementing specific libraries/APIs
- Requesting current technology documentation
- Verifying API signatures or methods
- Working with external dependencies
- Upgrading framework versions

## 5-Step Methodology

### Step 1: Rapid Assessment (< 30 seconds)
- Extract library/API names from request
- Detect versions from dependency files:
  - `package.json` (Node.js)
  - `requirements.txt` (Python)
  - `Cargo.toml` (Rust)
- Ask ONE clarifying question if needed

### Step 2: Source Prioritization

| Priority | Source | Trust Level |
|----------|--------|-------------|
| 1 | Official documentation | HIGH |
| 2 | Migration guides | HIGH |
| 3 | Release notes | HIGH |
| 4 | GitHub repos | MEDIUM |
| 5 | Blogs, tutorials | LOW |
| ❌ | Stack Overflow, AI content | AVOID |

### Step 3: Information Retrieval (< 90 seconds)
- Use WebFetch for official documentation URLs
- Use WebSearch to discover official sites
- Extract:
  - API signatures
  - Setup instructions
  - Code examples
  - Gotchas/caveats
  - Best practices
- 60-second timeout per source

### Step 4: Verification & Citation
- Cite EVERY claim with:
  - Version number
  - Source URL
  - Section reference
- Assess confidence:
  - **HIGH**: Official docs, exact version match
  - **MEDIUM**: GitHub, close version
  - **LOW**: Community sources, version mismatch

### Step 5: Structured Output
Deliver ResearchPack format:

```markdown
## ResearchPack: [Library/API Name]

### Quick Reference
- **Library**: name v1.2.3
- **Use Case**: [what we're implementing]
- **Confidence**: HIGH/MEDIUM/LOW

### Key APIs
| Function | Signature | Description |
|----------|-----------|-------------|
| func1 | `func1(arg: Type): Return` | Does X |
| func2 | `func2(arg: Type): Return` | Does Y |

### Setup Steps
1. Install: `npm install library`
2. Configure: ...
3. Import: ...

### Gotchas
- ⚠️ [Common mistake to avoid]
- ⚠️ [Version-specific caveat]

### Code Examples
```typescript
// Example usage
```

### Implementation Checklist
- [ ] Install dependencies
- [ ] Configure settings
- [ ] Import modules
- [ ] Implement feature

### Open Questions
- [ ] [Decision needed for planning phase]

### Sources
1. [Official Docs](url) - v1.2.3, Section X
2. [GitHub](url) - README
```

## Quality Standards

- **Accuracy**: API signatures match docs exactly
- **Citations**: Every claim has source URL
- **Version-aware**: Information matches project version
- **Actionable**: Clear implementation guidance
- **Time**: Under 2 minutes total

## Project-Specific Sources

### React/TypeScript
- https://react.dev/
- https://www.typescriptlang.org/docs/

### Material-UI
- https://mui.com/material-ui/

### Vite
- https://vitejs.dev/

### AI APIs
- https://docs.imagerouter.io/
- https://platform.openai.com/docs/

## Confidence Levels

| Level | Criteria |
|-------|----------|
| HIGH | Official docs, exact version, tested |
| MEDIUM | Official docs, close version |
| LOW | Community source, version uncertain |
| AVOID | No citation, speculation |
