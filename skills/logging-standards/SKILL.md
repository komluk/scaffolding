---
name: logging-standards
description: "Structured logging standards using structlog and Seq. TRIGGER when: adding log statements, configuring loggers, or reviewing log output. SKIP: metrics and alerting (use monitoring-observability); error control flow (use error-handling)."
---

# Logging Standards Skill

## Purpose
Standards for consistent, useful logging across all application layers.

## Auto-Invoke Triggers
- Adding log statements
- Configuring logging infrastructure
- Debugging issues
- Setting up monitoring

---

## Log Levels

| Level | Use Case | Example |
|-------|----------|---------|
| **TRACE** | Detailed debugging | Variable values, loop iterations |
| **DEBUG** | Diagnostic info | Method entry/exit, state changes |
| **INFO** | Normal operations | Request completed, job started |
| **WARN** | Potential issues | Retry attempt, deprecated usage |
| **ERROR** | Failures | Exception caught, operation failed |
| **FATAL** | System failure | Cannot start, out of memory |

### Level Selection Rules
- Production default: INFO
- Development default: DEBUG
- Never log TRACE in production
- ERROR should always have context

---

## Log Message Format

### Structure
```
[timestamp] [level] [correlation-id] [logger] - message {structured-data}
```

### Example
```
2024-01-15T10:30:45.123Z INFO abc-123-def UserService - User created {"userId": 42, "email": "user@example.com"}
```

### Message Guidelines
- Start with action verb: "Creating user", "Processing order"
- Be specific: "User 123 deleted" not "Deleted"
- Include relevant IDs
- Keep messages concise

---

## Structured Logging

### Required Fields
| Field | Description | Example |
|-------|-------------|---------|
| timestamp | ISO 8601 format | 2024-01-15T10:30:45.123Z |
| level | Log level | INFO, ERROR |
| message | Human-readable | "User created" |
| correlationId | Request trace ID | abc-123-def |
| logger | Source class/module | UserService |

### Contextual Fields
| Field | When to Include |
|-------|-----------------|
| userId | Authenticated request |
| requestPath | HTTP request |
| requestMethod | HTTP request |
| duration | Operation timing |
| errorCode | Error situations |
| stackTrace | ERROR level only |

---

## What to Log

### Always Log
- Application startup/shutdown
- Authentication events (login, logout, failures)
- Authorization failures
- External service calls (start, end, errors)
- Database migrations
- Configuration changes
- Business-critical operations

### Per Request
- Request start (DEBUG)
- Request completion with duration (INFO)
- Validation errors (WARN)
- Exceptions (ERROR)

### Never Log
- Passwords or tokens
- Credit card numbers
- Personal data (PII) without masking
- Session IDs in plain text
- API keys or secrets
- Full request/response bodies with sensitive data

---

## PII Masking

### Fields to Mask
| Field | Masking | Example |
|-------|---------|---------|
| Email | Partial | j***@example.com |
| Phone | Partial | +1***456 |
| Credit Card | Partial | ****-****-****-1234 |
| SSN | Full | *** |
| Password | Never log | - |
| Token | Never log | - |

### Masking Rules
- Mask at log time, not display time
- Keep enough for debugging (last 4 digits)
- Never log masked values to DEBUG level

---

## Error Logging

### Required Information
- Error type/code
- Error message
- Stack trace (first occurrence)
- Request context (path, method, user)
- Correlation ID
- Timestamp

### Error Logging Rules
- Log full stack trace on first occurrence
- Group repeated errors (rate limit logging)
- Include recovery actions taken
- Don't log expected errors as ERROR

---

## Performance Logging

### Metrics to Log
| Metric | Level | When |
|--------|-------|------|
| Request duration | INFO | Every request |
| Slow query | WARN | > 1 second |
| External call | DEBUG | Every call |
| Cache hit/miss | DEBUG | When relevant |

### Slow Operation Thresholds
| Operation | Warn Threshold |
|-----------|----------------|
| HTTP request | > 1s |
| Database query | > 500ms |
| External API | > 2s |
| Cache operation | > 100ms |

---

## Log Aggregation

### Requirements
- Centralized log storage
- Full-text search
- Correlation ID filtering
- Time-range queries
- Alerting on patterns

### Recommended Tools
| Tool | Use Case |
|------|----------|
| ELK Stack | Self-hosted, full-featured |
| Datadog | Cloud, APM integration |
| Splunk | Enterprise, compliance |
| Loki | Kubernetes-native |

---

## Log Retention

| Environment | Retention |
|-------------|-----------|
| Development | 7 days |
| Staging | 30 days |
| Production | 90 days |
| Audit logs | 1 year+ |

### Archival Rules
- Compress logs older than 7 days
- Archive to cold storage after retention
- Delete non-essential logs aggressively
- Keep audit logs per compliance

---

## Best Practices

### DO
- Use structured logging (JSON)
- Include correlation IDs
- Log at appropriate levels
- Mask sensitive data
- Use async logging in production
- Set up alerts for ERROR logs

### DON'T
- Log passwords or secrets
- Use string concatenation for messages
- Log inside tight loops
- Ignore log level guidelines
- Skip correlation IDs
- Log full stack traces repeatedly

---

## Logging Checklist

- [ ] Structured logging configured
- [ ] Log levels appropriate per environment
- [ ] Correlation IDs propagated
- [ ] PII masking implemented
- [ ] Error logs include context
- [ ] Slow operation logging enabled
- [ ] Log aggregation configured
- [ ] Alerts set up for errors
- [ ] Retention policy implemented

---

## Project-Specific Patterns

### structlog Configuration (`core/logging/config.py`)

This project uses **structlog** with stdlib integration, routing all logs through Python's `logging` module with per-handler formatters.

**Processor chain** (shared across all handlers):
```python
shared_processors = [
    structlog.contextvars.merge_contextvars,
    _add_log_context,          # Injects task_id, session_id, project_id, user_id
    _inject_context_to_record, # Copies context to LogRecord for OTel attributes
    structlog.stdlib.add_log_level,
    structlog.stdlib.add_logger_name,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.StackInfoRenderer(),
    structlog.processors.UnicodeDecoder(),
]
```

**Two output pipelines:**
1. **Console** - `ConsoleRenderer(colors=True)` for dev, `JSONRenderer` for prod
2. **OTLP/Seq** - `JSONRenderer` always (no ANSI codes), via `OTLPLogExporter`

### Context Variables

Four `contextvars.ContextVar` fields are automatically injected into every log event:
```python
from core.logging import set_log_context, clear_log_context
set_log_context(task_id="abc", session_id="sess", project_id="proj", user_id="123")
# All subsequent logs in this async context include these fields
```

### Logger Creation Pattern
```python
from core import get_logger          # Re-exported from core/__init__.py
logger = get_logger(__name__)        # Returns structlog.stdlib.BoundLogger
```

### Log Event Naming Convention

Events use **dot-separated domain.action** format:
```python
logger.info("app.startup_complete", max_concurrent_tasks=3)
logger.info("redis.connected")
logger.warning("db.schema_mismatch", migration_commands=[...])
logger.info("contributor.added", project_id=pid, user_id=uid, role="owner")
logger.error("redis.queue_push_error", queue=name, error=str(e))
logger.debug("redis.subscribed", channel=ch, task_id=tid)
```

### Seq/OpenTelemetry Integration

Configured in `main.py` at startup:
```python
setup_logging(
    log_level=LOG_LEVEL,      # From core.config (env: LOG_LEVEL)
    log_format=LOG_FORMAT,    # "console" or "json" (env: LOG_FORMAT)
    log_file=LOG_FILE,        # Optional rotating file (10MB, 5 backups)
    seq_enabled=SEQ_ENABLED,  # env: SEQ_ENABLED
    seq_endpoint=SEQ_ENDPOINT,# Default: https://localhost:5341/ingest/otlp/v1/logs
    seq_api_key=SEQ_API_KEY,  # env: SEQ_API_KEY (X-Seq-ApiKey header)
    service_name=OTEL_SERVICE_NAME,  # Resource: service.name, namespace: "scaffolding"
)
```

Shutdown flushes pending logs: `shutdown_logging()` called in app lifespan teardown.

### Key Files
| File | Purpose |
|------|---------|
| `core/logging/__init__.py` | Public API: `get_logger`, `set_log_context`, `TaskLogger` |
| `core/logging/config.py` | structlog setup, OTel/Seq integration, context vars |
| `core/logging/task_logger.py` | Task-specific step logging |
| `core/middleware/` | `CorrelationIdMiddleware`, `LoggingMiddleware`, `UserContextMiddleware` |
