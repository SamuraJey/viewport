# Viewport Monitoring Deployment

This repository owns a local LGTM/OpenTelemetry monitoring stack as code. It is intended for local and staging validation and as a production template, not a drop-in production deployment without operator hardening.

## Stack components

- Prometheus scrapes Viewport `/metrics`, exporters, and observability components.
- Alertmanager uses a placeholder route in `config/observability/alertmanager/alertmanager.yml.example`.
- Grafana provisions Prometheus, Loki, and Tempo datasources plus sample dashboards.
- Loki stores local container logs shipped by Grafana Alloy.
- Tempo stores traces received from the OpenTelemetry Collector.
- OpenTelemetry Collector receives OTLP on `4317`/`4318`, applies privacy attribute deletion, and exports traces to Tempo and OTLP metrics to a Prometheus scrape endpoint. The app also sanitizes spans before export.
- Grafana Alloy tails Docker logs and pushes them to Loki. It parses `trace_id`/`span_id`/`request_id` for log fields but does not promote them to Loki labels.
- Postgres, Redis/Valkey, cAdvisor, node-exporter, and blackbox exporters provide local infra signals.

## Local startup

```bash
cp .env.observability.example .env.observability.local
# Optional: edit local ports/passwords.
docker compose -f docker-compose.yml -f docker-compose.observability.yml --env-file .env.observability.local up -d
```

Local UIs:

- Grafana: <http://localhost:3000>
- Prometheus: <http://localhost:9090>
- Alertmanager: <http://localhost:9093>
- Loki: <http://localhost:3100>
- Tempo: <http://localhost:3200>
- OTel Collector health: <http://localhost:13133>

## Smoke checks

```bash
curl -fsS http://localhost:9090/-/ready
curl -fsS http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health}'
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:13133/
curl -fsS http://localhost:3100/ready
curl -fsS http://localhost:3200/ready
```

Generate sample API traffic:

```bash
curl -fsS http://localhost:8000/metrics | head
```


## Application telemetry toggles

The observability Compose overlay enables these non-secret app settings for local smoke tests:

- `LOG_FORMAT=json` — one JSON object per stdout line for Alloy/Loki ingestion.
- `OTEL_ENABLED=true` — opt-in OpenTelemetry setup. The application default is safe-disabled.
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317` — collector export path.
- `OTEL_SERVICE_NAME=viewport-api|viewport-celery`, `SERVICE_VERSION`, `DEPLOYMENT_ENVIRONMENT` — resource identity/correlation.
- `CELERY_METRICS_ENABLED=true`, `CELERY_METRICS_PORT=9108` — worker-process Prometheus endpoint for Celery task metrics.

If the collector is absent or the stack is stopped, disable `OTEL_ENABLED` or unset the endpoint; application startup and traffic should remain safe.

The Python 3.14 OpenTelemetry dependency gate is recorded in `docs/deployment/observability-dependency-report.md`.

## Production hardening checklist

Operator TODOs before production use:

- Protect `/metrics` with private networking, reverse-proxy deny rules, a private listener, or platform-native scrape access. It must not be internet-accessible.
- Replace `.env.observability.example` values and Alertmanager example receivers with secrets managed outside git.
- Put Grafana, Prometheus, Alertmanager, Loki, Tempo, and collector endpoints behind VPN/SSO/TLS or internal-only networks.
- Decide retention and disk budgets for metrics, logs, and traces; configure persistent volumes and backups.
- Validate real production logs for forbidden fields before enabling centralized production log ingestion.
- Tune alert thresholds after baseline traffic and staging burn-in.
- Decide whether self-hosted storage remains acceptable or whether to export to a managed observability vendor.
- Do not enable tail sampling unless all spans for a trace reach the same sampling decision point.

## Privacy rules

Telemetry must not include raw share-link passwords, JWTs, refresh tokens, cookies, auth headers, presigned URLs, raw IP addresses unless an approved hashing policy is in place, full user agents, private gallery notes, raw object keys, or filenames that expose customer data. Use low-cardinality status categories and hashes/fingerprints where correlation is necessary.

Do not add high-cardinality Loki/Prometheus labels such as raw routes, request IDs, trace IDs, span IDs, object keys, user IDs, gallery/photo/project/share IDs, full User-Agent strings, IP addresses, URLs, or exception messages.

## Rollback

The monitoring stack is isolated in `docker-compose.observability.yml`. To roll it back locally:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --env-file .env.observability.local down
```

Application traffic should continue without this stack. If future app-side OTLP export is enabled, rollback should include disabling `OTEL_ENABLED`/OTLP endpoint variables.
