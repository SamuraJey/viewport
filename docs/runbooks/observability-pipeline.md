# Runbook: Observability Pipeline

Alerts: `ObservabilityTargetDown`, `ViewportMetricsMissing`, `ViewportInternalMetricsProbeFailed`

## Meaning

A monitoring component is down or Prometheus no longer sees an expected target.

## First checks

1. Check `docker compose -f docker-compose.yml -f docker-compose.observability.yml ps`.
2. Check Prometheus `/targets` for scrape errors.
3. Validate recent config changes with the validation commands in `docs/deployment/monitoring.md`.
4. Inspect component logs: Prometheus, OTel Collector, Grafana, Loki, Tempo, Alloy, and Alertmanager.

## Mitigation

Revert the latest monitoring config change if validation fails. If only observability is degraded and user traffic is healthy, treat as urgent but not necessarily user-impacting.
