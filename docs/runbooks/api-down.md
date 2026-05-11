# Runbook: Viewport API Down

Alert: `ViewportAPIDown`

## Impact

Prometheus cannot scrape the API metrics endpoint. The API container may be down, wedged, or unreachable from the monitoring network.

## First checks

1. Check `docker compose ps app` and container restart count.
2. Check `curl -fsS http://app:8000/metrics` from the Prometheus container.
3. Review `viewport_app` logs in Grafana Loki or `docker logs viewport_app`.
4. Check Postgres, Redis, and RustFS health if app startup is failing.

## Escalate

Page the service owner for production API unavailability. Operator TODO: add real escalation target.
