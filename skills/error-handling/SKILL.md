---
name: error-handling
description: "Consistent error handling across React frontend and Python backend. TRIGGER when: implementing error boundaries, exception handlers, or try/catch blocks. SKIP: shaping HTTP error response bodies (use api-design); logging the error (use logging-standards)."
---

# Error Handling Skill

## Purpose
Standards for consistent error handling across frontend and Python backend.

## Auto-Invoke Triggers
- Implementing exception handling
- Creating custom exceptions
- Handling API errors
- Implementing retry logic
- Designing user-facing error messages

---

## Error Categories

| Category | HTTP Code | User Action | Log Level |
|----------|-----------|-------------|-----------|
| Validation | 400 | Show field errors | WARN |
| Authentication | 401 | Redirect to login | WARN |
| Authorization | 403 | Show permission denied | WARN |
| NotFound | 404 | Show not found message | INFO |
| Conflict | 409 | Show conflict details | WARN |
| RateLimit | 429 | Show retry-after | WARN |
| ExternalService | 502 | Show fallback/retry option | ERROR |
| Internal | 500 | Show generic error | ERROR |
| Critical | 500 | Show maintenance page | CRITICAL |

---

## Exception Hierarchy Design

### Principles
- Create base `AppException` class for all application errors
- Extend with specific exception types per category
- Include: code, message, status code, details (optional)
- Never expose internal details to clients

### Required Exception Types
1. `ValidationException` - Invalid input data
2. `AuthenticationException` - Auth token invalid/expired
3. `AuthorizationException` - User lacks permission
4. `NotFoundException` - Resource doesn't exist
5. `ConflictException` - Resource state conflict
6. `RateLimitException` - Too many requests
7. `ExternalServiceException` - Third-party failure

---

## Error Response Format

### Standard Structure
```
{
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "details": { "field": ["error1", "error2"] },
  "correlationId": "abc-123"
}
```

### Error Codes Convention
- Use SCREAMING_SNAKE_CASE
- Be specific: `USER_NOT_FOUND` not `NOT_FOUND`
- Group by domain: `AUTH_TOKEN_EXPIRED`, `AUTH_INVALID_CREDENTIALS`

---

## Frontend Error Handling

### Principles
- Catch errors at API client level
- Transform to typed error objects
- Display user-friendly messages
- Log for debugging (not in production)

### Error Boundary Rules
- Wrap major UI sections
- Provide fallback UI
- Log errors to monitoring service
- Allow recovery when possible

### User Message Guidelines
- Be helpful, not technical
- Suggest actions user can take
- Don't blame the user
- Include support contact for critical errors

---

## Backend Error Handling

### Global Exception Handler
- Catch all unhandled exceptions
- Log with full context (path, method, user, correlation ID)
- Return standardized error response
- Never return stack traces in production

### Exception Handling Rules
- Throw specific exceptions, catch specific exceptions
- Don't catch exceptions you can't handle
- Always re-throw or wrap caught exceptions
- Log at the boundary, not deep in code

### What to Log
- Error type and message
- Request path and method
- User ID (if authenticated)
- Correlation ID
- Stack trace (for unexpected errors)

### What NOT to Log
- Passwords or tokens
- Full request/response bodies with PII
- Credit card numbers
- Personal data (GDPR)

---

## Retry Logic Standards

### When to Retry
- Network timeouts
- 5xx server errors (external services)
- Rate limit (with backoff)
- Connection refused

### When NOT to Retry
- 4xx client errors (except 429)
- Validation errors
- Authentication errors
- Non-idempotent operations (without idempotency key)

### Retry Configuration
- Max attempts: 3
- Initial delay: 1 second
- Backoff multiplier: 2 (exponential)
- Max delay: 30 seconds
- Add jitter to prevent thundering herd

---

## Circuit Breaker Pattern

### Configuration
- Failure threshold: 5 failures
- Recovery timeout: 30 seconds
- Half-open max requests: 3

### States
1. **Closed** - Normal operation, requests pass through
2. **Open** - Failures exceeded threshold, requests fail fast
3. **Half-Open** - Testing if service recovered

---

## Best Practices

### DO
- Use specific exception types
- Include correlation IDs in all errors
- Log errors with context
- Return user-friendly messages
- Implement retry for transient failures
- Use circuit breaker for external services

### DON'T
- Catch generic `Exception` without re-throwing
- Log sensitive data
- Return stack traces to clients
- Use exceptions for control flow
- Ignore errors silently
- Retry non-idempotent operations blindly

---

## Quality Checklist

- [ ] All API endpoints return consistent error format
- [ ] Custom exceptions extend base exception class
- [ ] Global exception handler catches all unhandled exceptions
- [ ] Errors logged with appropriate level and context
- [ ] User messages helpful but don't leak internals
- [ ] Retry logic for external service calls
- [ ] Circuit breaker for cascading failure protection
- [ ] Correlation IDs tracked through entire request
