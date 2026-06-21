# Production Monitoring Guide

**Date**: 2024-06-21  
**Status**: ✅ COMPLETE

---

## Overview

This document describes the platform health monitoring system for MJ Maps.

---

## Components Monitored

### Website

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Uptime | 99.9% | < 99% |
| Asset failures | 0 | > 0 |
| Time to first byte | < 500ms | > 1000ms |

### Driver App

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Crash events | 0 | > 5/hour |
| Route failures | < 1% | > 5% |
| GPS failures | < 1% | > 5% |
| Navigation launch failures | < 1% | > 5% |

### API

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Response latency (p95) | < 500ms | > 1000ms |
| Auth failures | < 1% | > 5% |
| Failed replans | < 1% | > 5% |
| Error rate | < 0.1% | > 1% |

---

## Health Endpoints

### GET /web-health

Returns status of all frontend builds:

```json
{
  "landing": true,
  "driver": true,
  "dispatcher": true
}
```

### GET /api/v1/health

Returns API health status:

```json
{
  "ok": true,
  "timestamp": "2024-06-21T12:00:00Z",
  "version": "1.0.0"
}
```

---

## Monitoring Service

Location: `services/platform-health/index.ts`

### Functions

| Function | Purpose |
|----------|---------|
| `getPlatformHealth()` | Returns overall platform status |
| `checkWebsiteHealth()` | Checks frontend builds |
| `checkApiHealth()` | Checks API responsiveness |
| `checkDatabaseHealth()` | Checks database connectivity |
| `checkRedisHealth()` | Checks Redis connectivity |
| `recordMetric()` | Records metric events |
| `getMetricsSummary()` | Returns recent metrics |
| `shouldAlert()` | Determines if alert needed |
| `generateAlertMessage()` | Formats alert message |

---

## Alert Integration

### When to Alert

1. **Platform down**: Any component status = 'down'
2. **High latency**: API latency > 1000ms
3. **High error rate**: Error rate > 1%
4. **Driver app issues**: Crash rate > 5/hour

### Alert Channels

Recommended integrations:
- **Email**: For critical alerts
- **Slack**: For real-time notifications
- **PagerDuty**: For on-call escalation

---

## Metrics Collection

### Client-Side Metrics

Collected via driver app:
- Route start/end events
- Navigation launch events
- GPS quality events
- Crash events
- Performance metrics

### Server-Side Metrics

Collected via API:
- Request latency
- Error rates
- Auth success/failure
- Database query times
- Redis operation times

---

## Dashboard

### Recommended Dashboards

1. **Overview Dashboard**
   - Platform status (green/yellow/red)
   - Active routes
   - Active drivers
   - Stops completed today

2. **Performance Dashboard**
   - API latency (p50, p95, p99)
   - Error rates
   - Throughput (req/min)

3. **Driver App Dashboard**
   - Crash rate
   - Navigation launch success rate
   - GPS quality

4. **Business Dashboard**
   - Routes completed
   - Stops delivered
   - Failed stops
   - POD capture rate

---

## Incident Response

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P1 | Platform down | 15 minutes |
| P2 | Major feature broken | 1 hour |
| P3 | Minor feature broken | 4 hours |
| P4 | Cosmetic issue | Next sprint |

### Runbooks

1. **Platform Down**
   - Check Railway deployment status
   - Check database connectivity
   - Check Redis connectivity
   - Review recent deployments
   - Roll back if necessary

2. **High Latency**
   - Check database query performance
   - Check Redis cache hit rate
   - Review recent code changes
   - Scale horizontally if needed

3. **Driver App Issues**
   - Check crash logs
   - Review recent app releases
   - Check for network issues
   - Coordinate with mobile team

---

## Logs

### Log Levels

| Level | Use Case |
|-------|----------|
| ERROR | Failures requiring attention |
| WARN | Potential issues |
| INFO | Important events |
| DEBUG | Detailed debugging (prod disabled) |

### Log Format

```json
{
  "timestamp": "2024-06-21T12:00:00Z",
  "level": "error",
  "service": "mj-maps-api",
  "message": "Database connection failed",
  "error": {
    "name": "ConnectionError",
    "message": "Connection refused"
  },
  "context": {
    "routeId": "abc123",
    "driverId": "def456"
  }
}
```

---

## Health Checks

### Railway Health Check

```bash
# Railway health check endpoint
/healthcheck
```

Configured in `railway.toml`:
```toml
[deploy]
healthcheckPath = "/api/v1/health"
healthcheckTimeout = 60
```

### Startup Health Check

The server performs startup checks:
1. Database connectivity
2. Redis connectivity
3. Environment variables

If any check fails, the server exits with code 1.

---

## Files Reference

| File | Purpose |
|------|---------|
| `services/platform-health/index.ts` | Health monitoring service |
| `services/api/web-serving.ts` | Web health endpoint |
| `services/api/server.ts` | API health endpoint |
| `Dockerfile` | Health check configuration |

---

## Sign-off

**Production Monitoring**: ✅ IMPLEMENTED

The platform health monitoring system is in place and ready for production use.

Recommended next steps:
1. Set up alerting channels (email/Slack)
2. Create monitoring dashboards
3. Test incident response runbooks
4. Schedule regular health reviews
