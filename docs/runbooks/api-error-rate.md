# Runbook: API Error Rate

Alert: `ViewportHigh5xxRate`

## Meaning

The API 5xx ratio exceeded the template threshold. This is user-impacting when sustained.

## First checks

1. Open the `Viewport API` dashboard and identify status/route concentration.
2. Query Loki for recent error logs: `{service="app"} |= "ERROR"` or by `trace_id` from Grafana exemplars.
3. Check Postgres, Redis, RustFS/S3, and Celery panels for simultaneous degradation.
4. If a deploy just happened, compare the error start time with the deploy window.

## Mitigation

Rollback the latest risky deploy if errors are new and widespread. Otherwise isolate the dependency or route causing failures.

Operator TODO: tune threshold and define production rollback owner.
