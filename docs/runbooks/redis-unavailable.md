# Runbook: Redis/Valkey Unavailable or Degraded

Alerts: `RedisDown`, `RedisEvictions`

## Impact

Auth refresh/session-adjacent flows, presigned URL cache, and Celery broker/result behavior may degrade.

## First checks

1. Check `docker compose ps redis redis-exporter`.
2. Inspect Redis memory, evictions, connected clients, and blocked clients.
3. Check Celery worker logs for broker connection failures.
4. Check app logs for cache graceful-degradation messages.

## Mitigation

Restore Redis/Valkey availability. If evictions are present, increase memory or adjust cache TTL/load after verifying no runaway key creation.
