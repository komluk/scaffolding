---
name: database-optimization
description: "Schema design, index strategy, migration safety, and query analysis. TRIGGER when: designing tables or indexes, writing a migration, or diagnosing a slow query. SKIP: writing SQLAlchemy model code (use python-patterns); generic backend patterns (use python-patterns)."
---

## Schema Design Principles

| Form | Use When |
|------|----------|
| 1NF | Always (atomic values) |
| 2NF | Most tables |
| 3NF | Transactional data |
| Denormalized | Read-heavy, reporting |

## Index Strategy

| Type | Use Case |
|------|----------|
| B-Tree | Default, range queries |
| Hash | Exact match only |
| GIN | Full-text, JSONB, arrays |
| Partial | Subset of rows |
| Composite | Multi-column queries |

### When to Index
- Primary keys (automatic)
- Foreign keys
- WHERE clause columns
- ORDER BY columns
- JOIN columns

### When NOT to Index
- Low cardinality columns
- Frequently updated columns
- Small tables (< 1000 rows)

## Migration Safety

### Safe Operations
- ADD COLUMN (nullable)
- ADD INDEX CONCURRENTLY
- CREATE TABLE
- ADD CONSTRAINT (with validation)

### Dangerous Operations
- DROP COLUMN
- RENAME COLUMN
- ALTER COLUMN TYPE
- DROP TABLE

### Migration Checklist
- [ ] Tested on production-like data
- [ ] Rollback script ready
- [ ] Estimated execution time
- [ ] Lock impact assessed
- [ ] Application compatibility verified

## Query Analysis

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Missing index | Sequential scan | Add index |
| N+1 queries | Many similar queries | Eager loading |
| Over-fetching | SELECT * | Select specific columns |
| No pagination | Large result sets | Add LIMIT/OFFSET |
| Cartesian join | Exploding rows | Fix JOIN conditions |

## Analysis Commands

### Frontend
- `npm run build -- --analyze` - Bundle analysis
- `lighthouse` - Performance audit
- Browser DevTools Performance tab

### Backend (Python)
- `py-spy` - CPU profiling
- `memory_profiler` - Memory analysis
- `EXPLAIN ANALYZE` - Query analysis

## Best Practices

### DO
- Measure before optimizing
- Design database for future scale
- Document schema decisions
- Use foreign keys and index them
- Plan migrations carefully
- Test with production-like data
- Focus on user-impacting metrics

### DON'T
- Optimize prematurely
- Guess at bottlenecks
- Use SELECT *
- Skip foreign keys
- Over-index
- Modify released migrations
- Ignore query plans

## Transaction Guidelines

- Keep transactions short; avoid I/O inside transactions
- Handle deadlocks with retry logic
- Default isolation: Read Committed (usually sufficient)
- Use Serializable only when phantom reads are unacceptable

## Connection Pooling

| Setting | Development | Production |
|---------|-------------|------------|
| Min connections | 1 | 5 |
| Max connections | 5 | 20-50 |
| Idle timeout | 30s | 300s |
| Max lifetime | 1800s | 3600s |

Pool size formula: `(cores * 2) + disk_spindles`. Always use pooling in production.

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case, plural | `users`, `order_items` |
| Columns | snake_case | `first_name`, `created_at` |
| Primary Key | `id` | `id` |
| Foreign Key | `{table}_id` | `user_id`, `order_id` |
| Indexes | `ix_{table}_{columns}` | `ix_users_email` |

---

## Project Database Patterns

### Async SQLAlchemy Setup (`core/database.py`)

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

engine = create_async_engine(
    DATABASE_URL,           # postgresql+asyncpg://...
    echo=False, future=True,
    pool_size=5, max_overflow=10,
    pool_recycle=3600,      # Recycle connections after 1 hour
    pool_pre_ping=True,     # Detect stale connections
)
async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)
```

**Session dependency** (commit-on-success, rollback-on-error):
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### Model Conventions

All models inherit from `core.database.Base` and follow these patterns:

| Convention | Pattern | Example |
|-----------|---------|---------|
| Primary key | `String(36)`, UUID as string | `id: Mapped[str] = mapped_column(String(36), primary_key=True)` |
| Timestamps | `DateTime(timezone=True)` + `utc_now` | `created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)` |
| Foreign keys | Explicit `ondelete` policy | `ForeignKey("projects.id", ondelete="CASCADE")` |
| Nullable FK | `ondelete="SET NULL"` | `ForeignKey("users.id", ondelete="SET NULL")` |
| Indexes | On FKs and query columns | `index=True` on project_id, created_at, github_id |
| Type hints | `Mapped[]` with `mapped_column` | SQLAlchemy 2.0 declarative style |
| Relationships | `TYPE_CHECKING` guard for imports | Avoids circular imports between modules |

### Models Overview

| Table | Model | Key Fields |
|-------|-------|-----------|
| `projects` | `Project` | id, path (unique), name, created_at |
| `task_refs` | `TaskRef` | id, project_id (FK), conversation_id, session_id, created_by (FK) |
| `users` | `User` | id (uuid4), github_id (unique), github_login, avatar_url |
| `user_projects` | `UserProject` | user_id (FK), project_id (FK), role, UniqueConstraint |

### Relationship Patterns
```python
# Parent side - cascade delete orphans
tasks: Mapped[list["TaskRef"]] = relationship(
    "TaskRef", back_populates="project", cascade="all, delete-orphan"
)
# Child side
project: Mapped["Project"] = relationship("Project", back_populates="tasks")
```

### Alembic Migration Conventions

- **Sync driver**: Alembic uses `psycopg2` (strips `+asyncpg` from URL)
- **Advisory locks**: `pg_advisory_lock(1573678)` prevents concurrent migrations
- **Schema validation**: `main.py` validates ORM vs DB schema on startup, logs warnings
- **Migration file naming**: `{hash}_{description}.py` with `upgrade()` and `downgrade()`
- **All models imported in `env.py`**: Required for autogenerate support
- **Safe pattern**: Always include both `upgrade()` and `downgrade()` functions
