---
name: python-patterns
description: "Python backend patterns: FastAPI, async SQLAlchemy, Pydantic. TRIGGER when: creating routes, models, schemas, or services in Python. SKIP: REST contract design (use api-design); schema/index tuning (use database-optimization)."
---

# Python Backend Patterns Skill

## Purpose
Best practices for Python backend development with FastAPI, SQLAlchemy, and async programming.

## Auto-Invoke Triggers
- Creating FastAPI routes
- Working with SQLAlchemy models
- Implementing async operations
- Creating Pydantic schemas

---

## Project Structure

```
app/
└── backend/
    ├── app/
    │   ├── main.py              # FastAPI app initialization
    │   ├── config.py            # Settings (pydantic-settings)
    │   ├── api/v1/endpoints/    # Route handlers
    │   ├── core/                # Security, exceptions
    │   ├── models/              # SQLAlchemy models
    │   ├── schemas/             # Pydantic schemas
    │   ├── services/            # Business logic
    │   ├── repositories/        # Data access
    │   └── db/session.py        # Database session
    ├── tests/
    ├── alembic.ini
    └── requirements.txt
```

---

## Layer Responsibilities

| Layer | Responsibility |
|-------|----------------|
| **Endpoints** | HTTP handling, request/response |
| **Services** | Business logic, orchestration |
| **Repositories** | Data access, queries |
| **Models** | Database schema |
| **Schemas** | Data validation, serialization |

---

## Async Database Patterns

### Session Management
- Use `async_sessionmaker` for async sessions
- Use dependency injection for session
- Commit in dependency, rollback on exception
- Use `expire_on_commit=False` for response data

### Query Patterns
- Use `select()` statements (SQLAlchemy 2.0 style)
- Prefer `scalar_one_or_none()` for single items
- Use `scalars().all()` for lists
- Eager load relationships with `selectin` or `joinedload`

---

## Pydantic Schema Patterns

### Schema Types
| Type | Purpose | Example |
|------|---------|---------|
| Base | Shared fields | `UserBase(email, username)` |
| Create | POST request | `UserCreate(Base + password)` |
| Update | PATCH request | `UserUpdate(all optional)` |
| Response | API response | `UserResponse(Base + id, created_at)` |
| InDB | Internal with secrets | `UserInDB(Response + hashed_password)` |

### Best Practices
- Use `model_config = ConfigDict(from_attributes=True)` for ORM
- Use `Field()` for validation constraints
- Use `field_validator` for custom validation
- Separate request and response schemas

---

## Repository Pattern

### Base Repository Methods
- `get_by_id(id)` - Single item by primary key
- `get_all(skip, limit)` - Paginated list
- `create(**kwargs)` - Insert new record
- `update(id, **kwargs)` - Update existing
- `delete(id)` - Remove record

### Specific Repositories
- Extend base with domain-specific queries
- Example: `get_by_email()`, `get_active_users()`

---

## Service Layer

### Responsibilities
- Validate business rules
- Coordinate multiple repositories
- Transform data between layers
- Raise domain exceptions

### Pattern
- Inject repository via constructor
- Return Pydantic schemas, not models
- Raise specific exceptions (NotFoundError, ConflictError)

---

## Dependency Injection

### Common Dependencies
- `get_db` - Database session
- `get_current_user` - Authenticated user
- `get_current_superuser` - Admin user
- Service factories - `get_user_service(session)`

### Pattern
```python
# Endpoint receives dependencies, passes to service
async def create_user(
    data: UserCreate,
    session: AsyncSession = Depends(get_db)
):
    service = UserService(session)
    return await service.create(data)
```

---

## Configuration

### Settings Class
- Use `pydantic-settings` for env loading
- Use `@lru_cache` for singleton
- Define defaults for optional settings
- Use `@property` for computed values

### Environment Variables
- `DATABASE_URL` - Database connection
- `SECRET_KEY` - JWT signing
- `DEBUG` - Development mode
- `CORS_ORIGINS` - Allowed origins

---

## Testing Patterns

### Fixtures
- `db_session` - In-memory SQLite session
- `client` - AsyncClient with app
- Override `get_db` dependency for tests

### Test Structure
- One test file per module
- Use `pytest.mark.asyncio` for async tests
- AAA pattern: Arrange, Act, Assert
- Mock external services

---

## Best Practices

### DO
- Use async/await consistently
- Use type hints everywhere
- Use Pydantic for all validation
- Use dependency injection
- Use repository pattern for data access
- Separate business logic into services

### DON'T
- Mix sync and async database calls
- Put business logic in routes
- Use raw SQL without parameters
- Catch generic Exception
- Store secrets in code
- Skip server-side validation

---

## Code Quality

| Tool | Purpose |
|------|---------|
| black | Code formatting |
| ruff | Linting |
| mypy | Type checking |
| pytest | Testing |
| pytest-cov | Coverage |
