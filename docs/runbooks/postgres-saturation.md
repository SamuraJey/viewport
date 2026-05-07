# Runbook: Postgres Saturation

Alerts: `PostgresDown`, `PostgresConnectionSaturation`

## First checks

1. Check Postgres container health and disk space.
2. Inspect connection counts, locks, and deadlocks in Grafana.
3. Identify app/Celery restart loops that may create connection storms.
4. Confirm exporter credentials are valid if only exporter scrape is failing.

## Mitigation

Reduce app/worker concurrency or restart leaking clients if safe. Increase DB resources only after confirming the root cause.

Operator TODO: create a least-privilege exporter database user in production.
