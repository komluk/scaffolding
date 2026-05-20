---
name: docker-templates
description: "Docker multi-stage build templates, image security, and docker-compose patterns. TRIGGER when: writing a Dockerfile, composing services, or hardening a container image. SKIP: CI pipeline definitions (use github-actions-template); runtime monitoring (use monitoring-observability)."
---

## Multi-stage Build Pattern

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production=false
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Security: Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy only production artifacts
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./

USER nextjs
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

## Docker Security Best Practices

| Practice | Implementation |
|----------|----------------|
| Non-root user | `USER nodejs` after setup |
| Minimal base image | Use `-alpine` variants |
| No secrets in image | Use runtime env vars |
| Pin versions | `FROM node:20.10.0-alpine` |
| .dockerignore | Exclude node_modules, .git, .env |
| Read-only filesystem | `--read-only` flag when possible |
| Resource limits | Set memory/CPU limits |

## Docker Compose Patterns

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

## Image Size Targets

| App Type | Target Size | Strategy |
|----------|-------------|----------|
| Python API | < 200MB | `python:3.12-slim` + multi-stage |
| Node.js API | < 150MB | `node:20-alpine` + multi-stage |
| Go binary | < 50MB | `golang:1.21-alpine` build, `scratch` runtime |

## Health Check Configuration

| Setting | Recommended |
|---------|-------------|
| Interval | 30s |
| Timeout | 10s |
| Retries | 3 |
| Start period | 30s |

Return 200 for healthy, 503 for unhealthy. Keep checks lightweight.

## Environment Variable Hierarchy

1. Runtime environment variables (highest priority)
2. `.env` file
3. `docker-compose.yml` defaults
4. Dockerfile `ENV` defaults (lowest)

Provide `.env.example` with placeholders (committed). Never commit `.env` files with secrets.

## Resource Limits

| Resource | Development | Production |
|----------|-------------|------------|
| Memory | 512MB | Based on app profiling |
| CPU | 0.5 | Based on app profiling |

Always set memory limits. Log to stdout/stderr, never to files inside containers.

## Bundled References

Usable templates in `references/` based on actual project patterns:

| File | Description |
|------|-------------|
| `references/Dockerfile.react` | React + nginx multi-stage build (node:22-alpine build, nginx:alpine prod) |
| `references/Dockerfile.python` | FastAPI multi-stage build (python:3.11-slim, uvicorn) |
| `references/docker-compose.example.yml` | Minimal FastAPI + Postgres + Redis stack |

Copy and adapt these templates for new services. All include health checks, non-root users, and alpine base images.
