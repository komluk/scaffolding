---
name: api-design
description: "RESTful API design standards: resource naming, HTTP methods, status codes, pagination, versioning. TRIGGER when: designing new API endpoints, defining error response shapes, or adding pagination/filtering. SKIP: implementing FastAPI route code (use python-patterns); error-handling internals (use error-handling)."
---

# API Design Skill

## Purpose
Standards and best practices for designing RESTful APIs.

## Auto-Invoke Triggers
- Designing new API endpoints
- Creating OpenAPI documentation
- Implementing API versioning
- Designing error responses
- Implementing pagination

---

## REST API Principles

### Resource Naming
- Use **nouns**, not verbs: `/users` not `/getUsers`
- Use **plural** nouns: `/users` not `/user`
- Use **kebab-case**: `/user-profiles` not `/userProfiles`
- Use **lowercase** only
- Max **2 levels** nesting: `/users/{id}/posts`

### URL Patterns

| Pattern | Example | Use Case |
|---------|---------|----------|
| Collection | `/users` | List resources |
| Item | `/users/{id}` | Single resource |
| Nested | `/users/{id}/posts` | Related resources |
| Action | `/users/{id}/activate` | Non-CRUD operations |

---

## HTTP Methods

| Method | Purpose | Idempotent | Safe | Has Body |
|--------|---------|------------|------|----------|
| GET | Read | Yes | Yes | No |
| POST | Create | No | No | Yes |
| PUT | Replace entire resource | Yes | No | Yes |
| PATCH | Partial update | No | No | Yes |
| DELETE | Remove | Yes | No | No |

### Method Selection Rules
- GET for retrieval only, never modify state
- POST for creation, returns 201 with Location header
- PUT replaces entire resource, all fields required
- PATCH for partial updates, only changed fields
- DELETE returns 204 No Content on success

---

## Status Codes

### Success (2xx)
| Code | Use Case |
|------|----------|
| 200 OK | GET, PUT, PATCH success |
| 201 Created | POST success (+ Location header) |
| 204 No Content | DELETE success |

### Client Error (4xx)
| Code | Use Case |
|------|----------|
| 400 Bad Request | Malformed request, validation error |
| 401 Unauthorized | Authentication required |
| 403 Forbidden | Authenticated but no permission |
| 404 Not Found | Resource doesn't exist |
| 409 Conflict | Resource state conflict |
| 422 Unprocessable Entity | Semantic validation error |
| 429 Too Many Requests | Rate limit exceeded |

### Server Error (5xx)
| Code | Use Case |
|------|----------|
| 500 Internal Server Error | Unexpected error |
| 502 Bad Gateway | External service failure |
| 503 Service Unavailable | Temporarily down |

---

## Response Format Standards

### Success Response Structure
- Single resource: `{ "data": { ... } }`
- Collection: `{ "data": [...], "pagination": {...} }`
- Include only requested/necessary fields

### Error Response Structure
Required fields:
- `code` - Machine-readable error code
- `message` - Human-readable description

Optional fields:
- `details` - Field-specific errors (validation)
- `correlationId` - For debugging/support

### Pagination Standards
- Default page size: 20
- Maximum page size: 100
- Use cursor-based for large datasets
- Use offset-based for simple cases
- Always include: `page`, `pageSize`, `totalItems`, `totalPages`

---

## Query Parameters

### Filtering
- Simple: `?status=active`
- Multiple: `?status=active&role=admin`
- Range: `?createdAt[gte]=2024-01-01`
- Search: `?search=keyword`

### Sorting
- Ascending: `?sort=createdAt`
- Descending: `?sort=-createdAt`
- Multiple: `?sort=lastName,firstName`

### Field Selection
- Sparse fields: `?fields=id,email,username`
- Reduces payload size

---

## Versioning Strategy

### Recommended: URL Path Versioning
- Format: `/api/v1/resource`
- Clear, cacheable, easy to implement
- Support minimum N-1 versions

### Deprecation Rules
- Announce 6 months before removal
- Include `Sunset` header on deprecated versions
- Document migration path

---

## Security Requirements

### Authentication
- Use Bearer tokens (JWT) for user auth
- Use API keys for service-to-service
- Never pass credentials in URL

### Authorization
- Check permissions on every request
- Validate resource ownership
- Use principle of least privilege

### Rate Limiting
- Implement per-user and per-endpoint limits
- Return rate limit headers
- Return 429 with Retry-After

---

## Documentation Requirements

### OpenAPI/Swagger Must Include
- All endpoints with methods
- Request/response schemas
- Parameter descriptions
- Error responses
- Authentication methods
- Examples for each endpoint

---

## API Design Checklist

### Naming
- [ ] URLs use plural nouns
- [ ] URLs use kebab-case
- [ ] No verbs in URLs (except actions)
- [ ] Consistent naming across endpoints

### HTTP Semantics
- [ ] Correct method for each operation
- [ ] Appropriate status codes
- [ ] 201 + Location header for POST
- [ ] 204 for successful DELETE

### Data
- [ ] Consistent response envelope
- [ ] Clear validation error messages
- [ ] Pagination for collections
- [ ] Field selection supported

### Security
- [ ] Authentication required where needed
- [ ] Authorization on resources
- [ ] Rate limiting implemented
- [ ] Input validation complete

### Documentation
- [ ] OpenAPI spec complete
- [ ] Examples provided
- [ ] Errors documented
- [ ] Versioning documented
