# Runbook: Celery Backlog or Worker Missing

Alerts: `CeleryWorkerContainerDown`, `CeleryContainerRestarting`

## Impact

Thumbnail generation, orphan cleanup, and background maintenance can stall.

## First checks

1. Check `docker compose ps celery_worker` and restart/OOM status.
2. Inspect `viewport_celery_worker` logs for task exceptions or broker connectivity.
3. Check Redis/Valkey availability and memory/eviction panels.
4. Check Postgres and RustFS/S3 for dependency failures.
5. Confirm only one beat scheduler is active before scaling workers.

## Mitigation

Restart the worker only after capturing logs. If Redis is unhealthy, restore broker health first. If backlog is caused by task failures, pause the triggering flow or roll back the change.

Operator TODO: add broker queue-depth metrics and tune production backlog thresholds from baseline traffic.
