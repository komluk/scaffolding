---
name: semantic-memory-store
description: "Store knowledge in semantic memory for cross-session vector-similarity recall. Use when an agent discovers a reusable insight, pattern, or decision that should be retrievable by future agents via embedding search."
---

# Semantic Memory Store

Store knowledge as vector-embedded entries in the PostgreSQL semantic memory system. Entries are automatically embedded with all-MiniLM-L6-v2 (384 dims) and retrievable via cosine similarity search by any agent in future sessions.

## When to Use

- Agent discovers a non-obvious insight worth preserving beyond file-based memory
- A debugging session reveals a root cause that would help future agents
- An architectural decision is made that affects multiple components
- A pattern or anti-pattern is confirmed through implementation experience
- Cross-project knowledge that does not belong in a single file

## When NOT to Use

- Temporary task context (use conversation memory in `.scaffolding/conversations/`)
- Information already in CLAUDE.md, docs/, or KNOWLEDGE.md
- Large code snippets (max 2000 chars; use file-based memory instead)
- Speculative or unverified conclusions

## How to Store

Run this Bash command from the backend directory. The script calls the service layer directly, bypassing HTTP auth.

```bash
cd /opt/platform/scaffolding.tool/app/backend && /opt/platform/scaffolding.tool/app/backend/venv/bin/python3 -c "
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from core.config import DATABASE_URL
from semantic_memory.service import store_memory

async def _store():
    engine = create_async_engine(DATABASE_URL, pool_size=1, max_overflow=0)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with factory() as db:
            m = await store_memory(
                db=db,
                content='''CONTENT_HERE''',
                agent_name='AGENT_NAME',
                content_type='CONTENT_TYPE',
                tags=['TAG1', 'TAG2'],
            )
            await db.commit()
            print(f'Stored memory {m.id}')
    finally:
        await engine.dispose()

asyncio.run(_store())
"
```

### Parameter Reference

| Parameter | Required | Description |
|-----------|----------|-------------|
| `content` | Yes | Text to embed and store (max 2000 chars, truncated) |
| `agent_name` | No | Agent that created this memory (e.g. `developer`, `debugger`) |
| `content_type` | No | One of: `learning`, `error`, `pattern`, `decision` (default: `learning`) |
| `tags` | No | List of string tags for filtering |
| `task_id` | No | Source task ID if applicable |
| `project_id` | No | Associated project ID |
| `conversation_id` | No | Associated conversation ID |

### Content Types

| Type | Use When |
|------|----------|
| `learning` | General knowledge, best practices, how-to |
| `error` | Root cause analysis, error resolution steps |
| `pattern` | Confirmed code pattern, architecture pattern |
| `decision` | Architecture or design decision with rationale |

## Examples

### Store a debugging insight

```bash
cd /opt/platform/scaffolding.tool/app/backend && /opt/platform/scaffolding.tool/app/backend/venv/bin/python3 -c "
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from core.config import DATABASE_URL
from semantic_memory.service import store_memory

async def _store():
    engine = create_async_engine(DATABASE_URL, pool_size=1, max_overflow=0)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with factory() as db:
            m = await store_memory(
                db=db,
                content='SQLAlchemy async_session_maker bound to one event loop cannot be reused in a worker thread. Create a fresh engine+session per thread to avoid attached-to-different-loop errors.',
                agent_name='debugger',
                content_type='error',
                tags=['sqlalchemy', 'async', 'threading'],
            )
            await db.commit()
            print(f'Stored memory {m.id}')
    finally:
        await engine.dispose()

asyncio.run(_store())
"
```

### Store an architectural decision

```bash
cd /opt/platform/scaffolding.tool/app/backend && /opt/platform/scaffolding.tool/app/backend/venv/bin/python3 -c "
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from core.config import DATABASE_URL
from semantic_memory.service import store_memory

async def _store():
    engine = create_async_engine(DATABASE_URL, pool_size=1, max_overflow=0)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with factory() as db:
            m = await store_memory(
                db=db,
                content='Semantic memory uses local all-MiniLM-L6-v2 model (384 dims) instead of OpenAI API. Zero cost, ~5ms per embedding, runs on CPU. Trade-off: lower quality than text-embedding-3-small but no API dependency.',
                agent_name='architect',
                content_type='decision',
                tags=['semantic-memory', 'embedding', 'architecture'],
            )
            await db.commit()
            print(f'Stored memory {m.id}')
    finally:
        await engine.dispose()

asyncio.run(_store())
"
```

## How Retrieval Works

Stored memories are automatically recalled by the agent execution pipeline. When a task starts, `memory/integration.py` calls `_read_semantic_memory()` which:

1. Embeds the task prompt using the same model
2. Performs cosine similarity search against all stored memories
3. Returns top-K results (default 5) within the distance threshold (default 0.3)
4. Injects matching memories into the agent's context as `## Semantic Memory`

No manual retrieval is needed. Agents searching for specific memories can also use:

```bash
cd /opt/platform/scaffolding.tool/app/backend && /opt/platform/scaffolding.tool/app/backend/venv/bin/python3 -c "
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from core.config import DATABASE_URL
from semantic_memory.service import search_memories

async def _search():
    engine = create_async_engine(DATABASE_URL, pool_size=1, max_overflow=0)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with factory() as db:
            results = await search_memories(db=db, query='SEARCH_QUERY_HERE', top_k=5)
            for mem, dist in results:
                print(f'[{1-dist:.0%}] [{mem.agent_name}] {mem.content[:120]}')
    finally:
        await engine.dispose()

asyncio.run(_search())
"
```

## Prerequisites

- `SEMANTIC_MEMORY_ENABLED=true` must be set in the environment (check `core/config.py`)
- PostgreSQL must be running with the `semantic_memory` table (Alembic migration applied)
- The `sentence-transformers` package must be installed in `app/backend/venv`

## Deduplication

Content is deduplicated by SHA-256 hash. Storing the same content twice updates the existing entry (merges tags, updates timestamp) instead of creating a duplicate.

## Relationship to File-Based Memory

| System | Mechanism | Best For |
|--------|-----------|----------|
| File-based (agent-memory skill) | Markdown files in `.scaffolding/` | Structured, curated knowledge with manual organization |
| Semantic memory (this skill) | Vector DB with embedding search | Discoverable knowledge via natural language similarity |

Use both: file-based memory for well-organized reference material, semantic memory for fuzzy-match discoverable insights.
