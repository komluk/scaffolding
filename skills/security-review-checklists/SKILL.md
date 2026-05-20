---
name: security-review-checklists
description: "OWASP Top 10, STRIDE threat modeling, and auth/compliance review checklists. TRIGGER when: reviewing code for vulnerabilities, threat-modeling a feature, or auditing auth. SKIP: general code-quality review (use pattern-recognition); test coverage review (use testing-strategy)."
---

## OWASP Top 10 Checklist

| Vulnerability | Check |
|---------------|-------|
| Injection | Parameterized queries, input validation |
| Broken Auth | Session management, MFA where needed |
| Sensitive Data | Encryption, no logging PII |
| XXE | Disable external entities in XML |
| Broken Access | Authorization on all endpoints |
| Misconfiguration | Secure defaults, no debug in prod |
| XSS | Output encoding, CSP headers |
| Insecure Deserialization | Validate before deserialize |
| Vulnerable Components | Check dependencies |
| Logging | Audit trails, no sensitive data in logs |

## STRIDE Threat Modeling

| Threat | Check For |
|--------|-----------|
| **S**poofing | Authentication weaknesses |
| **T**ampering | Data integrity issues |
| **R**epudiation | Missing audit logs |
| **I**nfo Disclosure | Data exposure risks |
| **D**enial of Service | Rate limiting gaps |
| **E**levation | Authorization bypasses |

## Authentication Review

| Aspect | Requirements |
|--------|--------------|
| Password policy | Min length, complexity, no common passwords |
| Token handling | Secure storage, expiration, refresh |
| Session mgmt | Timeout, invalidation, secure cookies |
| MFA | Available for sensitive operations |

## Authorization Review

| Pattern | Check |
|---------|-------|
| RBAC | Roles properly defined and enforced |
| Resource access | Per-resource authorization |
| Least privilege | Minimal permissions granted |
| Default deny | Explicit grants required |

## Data Protection Review

| Data State | Requirement |
|------------|-------------|
| In transit | TLS 1.2+ |
| At rest | AES-256 encryption |
| In logs | No PII, no secrets |
| In errors | No stack traces to users |

## Compliance Quick Check

| Framework | Key Requirements |
|-----------|-----------------|
| GDPR | Consent, data minimization, deletion |
| HIPAA | PHI encryption, access controls |
| PCI DSS | Cardholder data protection |
| SOC 2 | Security controls, audit |

## Input Validation Rules

| Data Type | Validation |
|-----------|------------|
| Email | Regex pattern, max 255 chars |
| Password | Min 8 chars, upper + lower + number + special |
| URL | Protocol whitelist (https only) |
| File upload | Extension whitelist, MIME check, size limit |
| IDs | UUID format or positive integer |
| Free text | Max length, HTML sanitization |

Validate server-side always. Whitelist over blacklist. Fail fast.

## Bundled References

Printable checklists in `references/` for use during code reviews:

| File | Description |
|------|-------------|
| `references/owasp-checklist.md` | OWASP Top 10 (2021) with actionable checkboxes per category |
| `references/auth-checklist.md` | Authentication and authorization review with JWT, RBAC, and session checks |

Copy checklist items into PR review comments or use as a gate before merging security-sensitive changes.

## JWT Token Standards

| Token | Expiry | Storage |
|-------|--------|---------|
| Access | 15 minutes | HttpOnly cookie |
| Refresh | 7 days | HttpOnly cookie |

Include `iat`, `exp`, `sub` claims. Sign with RS256 or HS256. Never store in localStorage.

## Rate Limiting Defaults

| Endpoint Type | Limit |
|---------------|-------|
| Login | 5/minute |
| Password reset | 3/hour |
| API general | 100/minute |
| File upload | 10/minute |

Return headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` (on 429).

## Security Headers

| Header | Value |
|--------|-------|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| Strict-Transport-Security | max-age=31536000; includeSubDomains |
| Content-Security-Policy | default-src 'self' |
| Referrer-Policy | strict-origin-when-cross-origin |

## CORS Configuration

Never use `*` origin in production. Whitelist specific origins. Limit allowed methods and headers. Set `Access-Control-Max-Age: 600`.
