---
name: monitoring-observability
description: "Monitoring, metrics, alerting, and observability standards. TRIGGER when: implementing health checks, collecting metrics, or defining alert rules. SKIP: log statement formatting (use logging-standards); CI pipeline setup (use github-actions-template)."
---

# Monitoring & Observability Skill

## Purpose
Standards for monitoring, metrics, alerting, and observability.

## Auto-Invoke Triggers
- Setting up monitoring infrastructure
- Defining metrics and KPIs
- Configuring alerts
- Implementing distributed tracing

---

## Three Pillars of Observability

| Pillar | Purpose | Tools |
|--------|---------|-------|
| **Logs** | Event records | ELK, Loki, CloudWatch |
| **Metrics** | Numerical measurements | Prometheus, Datadog |
| **Traces** | Request flow | Jaeger, Zipkin, X-Ray |

---

## Key Metrics (Golden Signals)

### The Four Golden Signals
| Signal | Description | Example Metric |
|--------|-------------|----------------|
| **Latency** | Response time | p50, p95, p99 latency |
| **Traffic** | Request volume | Requests per second |
| **Errors** | Failure rate | Error percentage |
| **Saturation** | Resource usage | CPU, memory utilization |

### RED Method (Request-focused)
- **R**ate - Requests per second
- **E**rrors - Failed requests per second
- **D**uration - Request latency

### USE Method (Resource-focused)
- **U**tilization - Resource % used
- **S**aturation - Queue depth
- **E**rrors - Error count

---

## Application Metrics

### HTTP Endpoints
| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total requests |
| `http_request_duration_seconds` | Histogram | Request latency |
| `http_requests_in_flight` | Gauge | Active requests |
| `http_response_size_bytes` | Histogram | Response size |

### Database
| Metric | Type | Description |
|--------|------|-------------|
| `db_connections_active` | Gauge | Active connections |
| `db_query_duration_seconds` | Histogram | Query time |
| `db_errors_total` | Counter | Query errors |

### Business Metrics
| Metric | Type | Description |
|--------|------|-------------|
| `users_registered_total` | Counter | New registrations |
| `orders_created_total` | Counter | Orders placed |
| `payment_amount_total` | Counter | Revenue |

---

## Metric Types

| Type | Use Case | Example |
|------|----------|---------|
| **Counter** | Cumulative totals | Requests, errors |
| **Gauge** | Current value | Temperature, queue size |
| **Histogram** | Value distribution | Latency buckets |
| **Summary** | Quantiles | p50, p95, p99 |

### Naming Convention
```
{namespace}_{subsystem}_{name}_{unit}

http_server_request_duration_seconds
db_pool_connections_active
app_users_registered_total
```

---

## Alerting Strategy

### Alert Severity
| Severity | Response Time | Action |
|----------|---------------|--------|
| Critical | Immediate | Page on-call |
| Warning | Within hours | Create ticket |
| Info | Next business day | Review |

### Alert Rules
- Alert on symptoms, not causes
- Include runbook links
- Set appropriate thresholds
- Avoid alert fatigue
- Group related alerts

### What to Alert On
| Alert | Condition | Severity |
|-------|-----------|----------|
| Service down | Health check fails | Critical |
| High error rate | > 5% errors | Critical |
| High latency | p99 > 2s | Warning |
| High CPU | > 80% for 5min | Warning |
| Disk space | < 20% free | Warning |
| SSL expiry | < 30 days | Warning |

---

## SLOs and SLIs

### Service Level Indicators (SLIs)
- Availability: Successful requests / Total requests
- Latency: % requests < threshold
- Throughput: Requests per second
- Error rate: Failed requests / Total requests

### Service Level Objectives (SLOs)
| SLO | Target | Error Budget |
|-----|--------|--------------|
| Availability | 99.9% | 43.8 min/month |
| Latency (p99) | < 500ms | - |
| Error rate | < 0.1% | - |

### Error Budget
- Monthly allowed downtime
- Spend on risky deployments
- Freeze deploys when exhausted

---

## Distributed Tracing

### Concepts
| Term | Description |
|------|-------------|
| Trace | End-to-end request journey |
| Span | Single operation in trace |
| Context | Trace ID propagated across services |

### What to Trace
- Cross-service calls
- Database queries
- External API calls
- Message queue operations

### Trace Propagation
- Pass trace context in headers
- Standard: W3C Trace Context
- Headers: `traceparent`, `tracestate`

---

## Health Checks

### Endpoint Types
| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/health` | Basic liveness | 200 OK |
| `/health/ready` | Full readiness | 200 + deps status |
| `/health/live` | Process alive | 200 OK |

### Readiness Check Components
- Database connection
- Cache connection
- External service connectivity
- Required configuration present

### Health Response Format
```json
{
  "status": "healthy",
  "checks": {
    "database": "healthy",
    "cache": "healthy",
    "external-api": "degraded"
  },
  "version": "1.2.3"
}
```

---

## Dashboard Design

### Layout Principles
- Most important metrics at top
- Group related metrics
- Use consistent time ranges
- Include context (deploy markers)

### Standard Panels
1. **Overview** - Traffic, errors, latency
2. **Resources** - CPU, memory, disk
3. **Dependencies** - DB, cache, external APIs
4. **Business** - Domain-specific metrics

### Best Practices
- Link to runbooks
- Add annotations for deploys
- Use consistent colors
- Set reasonable refresh rates

---

## Runbooks

### Structure
1. **Alert description** - What triggered
2. **Impact** - User/business effect
3. **Diagnosis steps** - How to investigate
4. **Resolution steps** - How to fix
5. **Escalation** - Who to contact

### Required Runbooks
- Service restart procedure
- Database failover
- Rollback deployment
- Scale up/down
- Incident communication

---

## Best Practices

### DO
- Monitor the four golden signals
- Set up alerts before incidents
- Create runbooks for alerts
- Use distributed tracing
- Track SLOs and error budgets
- Review dashboards regularly

### DON'T
- Alert on every metric
- Ignore alert fatigue
- Skip health checks
- Forget to trace async operations
- Set unrealistic SLOs
- Neglect runbook maintenance

---

## Observability Checklist

### Metrics
- [ ] Golden signals tracked
- [ ] Custom business metrics
- [ ] Resource utilization metrics
- [ ] Dependency health metrics

### Alerting
- [ ] Critical alerts defined
- [ ] Severity levels set
- [ ] Runbooks linked
- [ ] On-call rotation configured

### Tracing
- [ ] Trace context propagated
- [ ] Key operations traced
- [ ] Trace sampling configured

### Dashboards
- [ ] Service overview dashboard
- [ ] Dependency dashboard
- [ ] Business metrics dashboard
- [ ] Deploy annotations enabled
