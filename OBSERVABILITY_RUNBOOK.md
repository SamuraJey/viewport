# Viewport Observability Runbook

Этот ранбук описывает, как с нуля поднять, проверить, настроить и безопасно эксплуатировать observability-стек Viewport, добавленный в репозиторий.

Стек предназначен для локальной разработки, staging-проверок и как шаблон для production. **Не выкатывай production “как есть” без hardening-чеклиста ниже.**

## 0. Что входит в стек

Приложение теперь умеет отдавать и отправлять следующие сигналы:

- **Metrics**: FastAPI `/metrics`, Celery metrics, Redis/cache/S3/upload/share counters and histograms.
- **Logs**: JSON stdout logs with request/task/trace/span context.
- **Traces**: OpenTelemetry traces from FastAPI/Celery/SQLAlchemy/Redis/botocore through OTel Collector into Tempo.
- **Dashboards**: Grafana dashboards provisioned from repo.
- **Alerts**: Prometheus alert rule templates + Alertmanager placeholder config.
- **Infra metrics**: Postgres exporter, Redis exporter, cAdvisor, node-exporter, blackbox exporter.

Important privacy boundary:

- raw JWT/password/cookies/auth headers/presigned URLs/object keys/IPs/full user agents/share IDs/project/gallery/photo IDs/email/name must not appear in metrics labels, logs, or traces;
- IDs and object keys should be hashed/fingerprinted through `src/viewport/telemetry_safety.py`;
- Prometheus/Loki labels must stay low-cardinality.

## 1. Important files

| File/path | Purpose |
| --- | --- |
| `docker-compose.observability.yml` | Compose overlay that adds Prometheus, Grafana, Loki, Tempo, OTel Collector, Alloy, exporters. |
| `.env.observability.example` | Safe local defaults for ports/password placeholders. Copy this before editing. |
| `config/observability/prometheus/prometheus.yml` | Prometheus scrape targets. |
| `config/observability/prometheus/rules/viewport-alerts.yml` | Alert rule templates. |
| `config/observability/alertmanager/alertmanager.yml.example` | Placeholder Alertmanager routing. Replace for real environments. |
| `config/observability/grafana/provisioning/**` | Auto-provisioned datasources and dashboard provider. |
| `config/observability/grafana/dashboards/**` | Grafana dashboard JSON. |
| `config/observability/loki/loki.yml` | Loki local config. |
| `config/observability/tempo/tempo.yml` | Tempo local config. |
| `config/observability/otel-collector.yaml` | OTel Collector pipeline and privacy deletion. |
| `config/observability/alloy/config.alloy` | Docker log shipping to Loki. |
| `src/viewport/observability.py` | App-side OTel setup. Safe-disabled unless `OTEL_ENABLED=true`. |
| `src/viewport/metrics.py` | Prometheus metrics definitions and `/metrics` setup. |
| `src/viewport/telemetry_safety.py` | Redaction/fingerprinting helpers used by logs/traces. |
| `docs/deployment/monitoring.md` | Short deployment note and smoke checks. |
| `docs/runbooks/*.md` | Incident runbooks for API, latency, Redis, S3, disk, observability pipeline, etc. |

## 2. Local port map

Defaults come from `.env.observability.example`.

| Component | URL/port | Notes |
| --- | --- | --- |
| Backend app metrics | <http://localhost:8000/metrics> | Exposed by app service. Must be private in production. |
| Grafana | <http://localhost:3000> | Default login: `admin` / `change-me-local-only`. |
| Prometheus | <http://localhost:9090> | Targets, metrics, alert rule evaluation. |
| Alertmanager | <http://localhost:9093> | Placeholder receiver locally. |
| Loki | <http://localhost:3100> | Log storage/query API. |
| Tempo | <http://localhost:3200> | Trace storage/query API. |
| OTel Collector gRPC | `localhost:4317` | App/worker OTLP export path in Compose uses `otel-collector:4317`. |
| OTel Collector HTTP | `localhost:4318` | OTLP HTTP receiver. |
| OTel Collector health | <http://localhost:13133/> | Health check endpoint. |
| Alloy | <http://localhost:12345> | Local Alloy server endpoint. |
| Celery metrics | internal `celery_worker:9108` | Scraped by Prometheus inside Compose network. |
| Postgres exporter | internal `postgres-exporter:9187` | Scraped by Prometheus. |
| Redis exporter | internal `redis-exporter:9121` | Scraped by Prometheus. |
| cAdvisor | internal `cadvisor:8080` | Container metrics. |
| node-exporter | internal `node-exporter:9100` | Host metrics. |
| blackbox exporter | internal `blackbox-exporter:9115` | Internal HTTP probe target. |

If any local port is busy, edit `.env.observability.local`, not the Compose file.

Example:

```bash
GRAFANA_PORT=3001
PROMETHEUS_PORT=9091
```

## 3. Prerequisites

Required locally:

- Docker + Docker Compose plugin.
- Project dependencies already synced through `uv` if you run Python checks locally.
- Enough disk for local Prometheus/Loki/Tempo volumes.
- Linux/macOS Docker socket access for Alloy/cAdvisor. On restrictive systems, Alloy/cAdvisor may need extra Docker permissions.

Optional tools for nicer checks:

```bash
jq --version
curl --version
```

## 4. First-time local setup

### Step 4.1 — Create private local env file

```bash
cp .env.observability.example .env.observability.local
```

Do not commit `.env.observability.local`. It should remain ignored by git.

### Step 4.2 — Edit local env if needed

```bash
$EDITOR .env.observability.local
```

Minimum things to consider locally:

- Change `GRAFANA_PORT` if port `3000` is busy.
- Change `GRAFANA_ADMIN_PASSWORD` if other people can access your machine.
- Keep `DEPLOYMENT_ENVIRONMENT=local` for local testing.
- Keep `PROMETHEUS_RETENTION=30d` or lower it if disk is tight.

For local only, the provided `POSTGRES_EXPORTER_DSN` uses the repository Compose Postgres credentials. In staging/production, replace it with a least-privilege exporter user and keep it outside git.

### Step 4.3 — Validate config before startup

Run this before starting the stack after config edits:

```bash
python - <<'PY'
import json
from pathlib import Path
import yaml

for path in sorted([Path('docker-compose.observability.yml'), *Path('config/observability').rglob('*.yml'), *Path('config/observability').rglob('*.yaml')]):
    yaml.safe_load(path.read_text())
    print(f'YAML OK: {path}')

for path in sorted(Path('config/observability/grafana/dashboards').glob('*.json')):
    json.loads(path.read_text())
    print(f'JSON OK: {path}')
PY

docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.local \
  config --quiet
```

Expected result: no output from `docker compose ... config --quiet` and `YAML OK` / `JSON OK` lines from the Python script.

## 5. Start the full local stack

Use the base Compose file plus the observability overlay:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.local \
  up -d --build
```

Check containers:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.local \
  ps
```

Useful logs during first startup:

```bash
docker logs viewport_app --tail=100
docker logs viewport_celery_worker --tail=100
docker logs viewport_prometheus --tail=100
docker logs viewport_grafana --tail=100
docker logs viewport_otel_collector --tail=100
docker logs viewport_alloy --tail=100
docker logs viewport_loki --tail=100
docker logs viewport_tempo --tail=100
```

## 6. Smoke checks after startup

### Step 6.1 — Core UIs and health endpoints

```bash
curl -fsS http://localhost:9090/-/ready && echo 'Prometheus ready'
curl -fsS http://localhost:3000/api/health && echo 'Grafana ready'
curl -fsS http://localhost:13133/ && echo 'OTel Collector healthy'
curl -fsS http://localhost:3100/ready && echo 'Loki ready'
curl -fsS http://localhost:3200/ready && echo 'Tempo ready'
```

### Step 6.2 — App metrics endpoint

```bash
curl -fsS http://localhost:8000/metrics | head -n 40
```

Expected:

- Prometheus text format output.
- `python_info`, HTTP metrics, and custom `viewport_*` metrics after traffic.

### Step 6.3 — Prometheus targets

If `jq` is available:

```bash
curl -fsS http://localhost:9090/api/v1/targets \
  | jq '.data.activeTargets[] | {job: .labels.job, instance: .labels.instance, health, lastError}'
```

In Prometheus UI:

1. Open <http://localhost:9090/targets>.
2. Check target health.
3. Initially, a few targets may be `unknown` until the first scrape finishes.
4. Persistent `down` targets need troubleshooting.

Expected important jobs:

- `viewport-api`
- `viewport-celery`
- `prometheus`
- `otel-collector`
- `loki`
- `tempo`
- `grafana`
- `alertmanager`
- `postgres-exporter`
- `redis-exporter`
- `cadvisor`
- `node-exporter`
- `blackbox-http`

## 7. Open Grafana and verify provisioning

1. Open <http://localhost:3000>.
2. Login with values from `.env.observability.local`:
   - default user: `admin`
   - default password: `change-me-local-only`
3. Go to **Connections / Data sources**.
4. Verify these datasources exist:
   - Prometheus
   - Loki
   - Tempo
5. Go to **Dashboards**.
6. Verify Viewport dashboards are present.

If dashboards are empty, generate traffic first. Empty dashboards immediately after startup are normal.

## 8. Generate representative local traffic

The stack is much easier to validate after real app behavior. Run normal user flows:

1. Start frontend if needed:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

2. In the app:
   - login/register;
   - create a project;
   - create a gallery;
   - upload photos;
   - confirm upload;
   - wait for thumbnails;
   - create a share link;
   - open public share;
   - try a wrong password on a protected share;
   - download a gallery/project ZIP;
   - delete a photo/gallery in a disposable test project.

3. Or at minimum hit metrics/API endpoints:

   ```bash
   curl -fsS http://localhost:8000/metrics > /tmp/viewport_metrics.txt
   ```

## 9. What to verify in each tool

### 9.1 Prometheus

Open <http://localhost:9090/graph> and try queries:

```promql
up
http_requests_total
http_request_duration_seconds_count
viewport_upload_events_total
viewport_public_share_events_total
viewport_s3_operations_total
viewport_redis_operations_total
viewport_presigned_cache_events_total
viewport_celery_tasks_total
```

Look for:

- labels are low-cardinality;
- no raw user IDs/share IDs/photo IDs/object keys/filenames/IPs/user agents;
- app and worker targets are `up`;
- counters increase when you run flows.

### 9.2 Grafana dashboards

Open the Viewport dashboards and verify:

- API request rate/latency/error panels show data;
- upload and thumbnail panels move after upload;
- Redis/S3 panels move after cache/object operations;
- Celery panels move after thumbnail tasks;
- infra panels show Postgres/Redis/container/host signals.

### 9.3 Loki logs

In Grafana Explore, select Loki and query:

```logql
{container_name="viewport_app"}
```

Useful variants:

```logql
{container_name="viewport_celery_worker"}
{container_name=~"viewport_app|viewport_celery_worker"} |= "ERROR"
{container_name=~"viewport_app|viewport_celery_worker"} | json
```

Verify:

- logs are JSON for app/worker;
- `request_id`, `trace_id`, `span_id` appear as fields when available;
- raw object keys, presigned URLs, JWTs, cookies, passwords, emails, raw IPs do not appear;
- IDs are absent, route-normalized, or fingerprinted.

### 9.4 Tempo traces

In Grafana Explore, select Tempo.

Verify:

- traces appear after API traffic;
- span names use normalized routes, not raw `/s/<uuid>` or raw object paths;
- span attributes do not contain raw URL/query/IP/user-agent/object key/SQL statements;
- traces correlate with logs through trace IDs.

### 9.5 Alertmanager

Open <http://localhost:9093>.

Locally, alert routes are placeholders. Use this to verify alert wiring, not real paging.

In Prometheus, open <http://localhost:9090/alerts> and confirm rules load without parse errors.

## 10. Common troubleshooting

### Prometheus target is down

1. Open <http://localhost:9090/targets>.
2. Read `lastError` for the target.
3. Check whether the container exists:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.observability.yml --env-file .env.observability.local ps
   ```

4. Check logs for the failing service:

   ```bash
   docker logs <container_name> --tail=200
   ```

### App metrics target is down

Check backend:

```bash
docker logs viewport_app --tail=200
curl -fsS http://localhost:8000/metrics | head
```

If the app itself is down, debug app startup first: Postgres, Redis, S3/RustFS, migrations, environment.

### Celery metrics are missing

Check worker env and logs:

```bash
docker logs viewport_celery_worker --tail=200
```

Confirm the overlay is being used. `CELERY_METRICS_ENABLED=true` and `CELERY_METRICS_PORT=9108` come from `docker-compose.observability.yml`.

### No logs in Loki

Check Alloy:

```bash
docker logs viewport_alloy --tail=200
curl -fsS http://localhost:3100/ready
```

Common causes:

- Docker socket not accessible to Alloy.
- App/worker not running with `LOG_FORMAT=json`.
- Loki not ready.

### No traces in Tempo

Check:

```bash
docker logs viewport_otel_collector --tail=200
docker logs viewport_app --tail=200
docker logs viewport_celery_worker --tail=200
curl -fsS http://localhost:13133/
```

Common causes:

- `OTEL_ENABLED` is not true in app/worker environment.
- App cannot reach `otel-collector:4317` on the Compose network.
- Collector config failed to load.
- No API/Celery traffic has occurred yet.

### Grafana is unavailable

Check port conflict and logs:

```bash
docker logs viewport_grafana --tail=200
```

If port `3000` is already used, set in `.env.observability.local`:

```bash
GRAFANA_PORT=3001
```

Then recreate:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --env-file .env.observability.local up -d grafana
```

### Postgres exporter fails

Local DSN is in `.env.observability.local`:

```bash
POSTGRES_EXPORTER_DSN=postgresql://viewport:viewport@postgres:5432/viewport?sslmode=disable
```

For production, create a least-privilege exporter user. Do not reuse the app owner account.

### cAdvisor/node-exporter fail on your machine

These exporters depend on host/container runtime permissions. If they fail locally but app metrics work, observability for the app is still valid. For production, use platform-native node/container metrics if preferred.

## 11. Stop, restart, and reset locally

### Stop observability + app stack

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.local \
  down
```

### Restart one service

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.local \
  restart prometheus
```

Examples:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --env-file .env.observability.local restart grafana
docker compose -f docker-compose.yml -f docker-compose.observability.yml --env-file .env.observability.local restart otel-collector
docker compose -f docker-compose.yml -f docker-compose.observability.yml --env-file .env.observability.local restart alloy
```

### Reset observability data volumes

This deletes local metrics/logs/traces/dashboard state. Do this only when you intentionally want a clean local stack.

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.local \
  down -v
```

## 12. Verification commands before committing observability changes

Run these after changing app telemetry code, dashboards, alerts, or configs.

### Backend tests

```bash
uv run pytest \
  tests/test_observability_logging.py \
  tests/test_observability_setup.py \
  tests/test_observability_config.py \
  tests/test_metrics.py \
  tests/test_logger.py \
  tests/test_main_lifespan.py \
  -q
```

### Ruff + format + mypy for observability-related files

```bash
uv run ruff check \
  src/viewport/telemetry_safety.py \
  src/viewport/logging_config.py \
  src/viewport/logger.py \
  src/viewport/metrics.py \
  src/viewport/observability.py \
  src/viewport/celery_app.py \
  src/viewport/services/redis_service.py \
  src/viewport/services/presigned_cache.py \
  src/viewport/s3_service.py \
  src/viewport/s3_utils.py \
  src/viewport/background_tasks.py \
  src/viewport/main.py \
  src/viewport/sharelink_access.py \
  src/viewport/api/public.py \
  src/viewport/api/photo.py \
  tests/test_metrics.py \
  tests/test_observability_config.py \
  tests/test_observability_logging.py \
  tests/test_observability_setup.py

uv run ruff format --check \
  src/viewport/telemetry_safety.py \
  src/viewport/logging_config.py \
  src/viewport/logger.py \
  src/viewport/metrics.py \
  src/viewport/observability.py \
  src/viewport/celery_app.py \
  src/viewport/services/redis_service.py \
  src/viewport/services/presigned_cache.py \
  src/viewport/s3_service.py \
  src/viewport/s3_utils.py \
  src/viewport/background_tasks.py \
  src/viewport/main.py \
  src/viewport/sharelink_access.py \
  src/viewport/api/public.py \
  src/viewport/api/photo.py \
  tests/test_metrics.py \
  tests/test_observability_config.py \
  tests/test_observability_logging.py \
  tests/test_observability_setup.py

uv run mypy \
  src/viewport/telemetry_safety.py \
  src/viewport/logging_config.py \
  src/viewport/logger.py \
  src/viewport/metrics.py \
  src/viewport/observability.py \
  src/viewport/celery_app.py \
  src/viewport/services/redis_service.py \
  src/viewport/services/presigned_cache.py \
  src/viewport/s3_service.py \
  src/viewport/s3_utils.py \
  src/viewport/background_tasks.py \
  src/viewport/main.py \
  src/viewport/sharelink_access.py \
  src/viewport/api/public.py \
  src/viewport/api/photo.py
```

### Config validation

```bash
python - <<'PY'
import json
from pathlib import Path
import yaml

for path in sorted([Path('docker-compose.observability.yml'), *Path('config/observability').rglob('*.yml'), *Path('config/observability').rglob('*.yaml')]):
    yaml.safe_load(path.read_text())
    print(f'YAML OK: {path}')

for path in sorted(Path('config/observability/grafana/dashboards').glob('*.json')):
    json.loads(path.read_text())
    print(f'JSON OK: {path}')
PY

docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.example \
  config --quiet
```

### OTel import/config smoke

```bash
uv run python - <<'PY'
from fastapi import FastAPI

imports = [
    'opentelemetry',
    'opentelemetry.sdk.trace',
    'opentelemetry.exporter.otlp.proto.grpc.trace_exporter',
    'opentelemetry.instrumentation.fastapi',
    'opentelemetry.instrumentation.asgi',
    'opentelemetry.instrumentation.sqlalchemy',
    'opentelemetry.instrumentation.redis',
    'opentelemetry.instrumentation.celery',
    'opentelemetry.instrumentation.logging',
    'opentelemetry.instrumentation.botocore',
]

for name in imports:
    __import__(name)
    print(f'IMPORT OK: {name}')

from viewport.observability import ObservabilitySettings, configure_observability

app = FastAPI()
settings = ObservabilitySettings(
    OTEL_ENABLED=True,
    OTEL_TRACES_EXPORTER='console',
    OTEL_INSTRUMENT_SQLALCHEMY=False,
    OTEL_INSTRUMENT_REDIS=False,
    OTEL_INSTRUMENT_BOTOCORE=False,
    OTEL_INSTRUMENT_CELERY=False,
)
print('CONFIGURE OK:', configure_observability(app, settings=settings))
PY
```

### Syntax and whitespace

```bash
uv run python -m py_compile \
  src/viewport/telemetry_safety.py \
  src/viewport/logging_config.py \
  src/viewport/logger.py \
  src/viewport/metrics.py \
  src/viewport/observability.py \
  src/viewport/celery_app.py \
  src/viewport/services/redis_service.py \
  src/viewport/services/presigned_cache.py \
  src/viewport/s3_service.py \
  src/viewport/s3_utils.py \
  src/viewport/background_tasks.py \
  src/viewport/main.py \
  src/viewport/sharelink_access.py \
  src/viewport/api/public.py \
  src/viewport/api/photo.py

git diff --check
```

## 13. Production/staging hardening checklist

Before staging or production, complete these items.

### 13.1 Secrets and env

- Do not use `.env.observability.example` as production env.
- Store production env in your secret manager or deployment platform.
- Replace `GRAFANA_ADMIN_PASSWORD`.
- Replace Alertmanager receivers/secrets.
- Replace `POSTGRES_EXPORTER_DSN` with a least-privilege exporter user.
- Keep all production credentials outside git.

### 13.2 Network exposure

- `/metrics` must not be public internet traffic.
- Prometheus, Grafana, Alertmanager, Loki, Tempo, OTel Collector must be private, VPN-only, SSO-protected, or behind internal networks.
- OTLP receiver ports `4317/4318` should be reachable only by trusted app/worker services.
- Decide whether Grafana is internal-only or SSO-protected.

### 13.3 Storage and retention

Set explicit retention and disk budgets for:

- Prometheus metrics;
- Loki logs;
- Tempo traces;
- Grafana state;
- Alertmanager state.

Production must define:

- volume sizes;
- backup policy if needed;
- retention periods;
- disk alerts;
- cleanup policy.

### 13.4 Sampling and performance

Local uses `OTEL_TRACES_SAMPLE_RATIO=1.0`. Production probably should not.

Decide:

- head sampling ratio;
- whether errors/slow requests need higher sampling;
- whether tail sampling is possible in your topology;
- collector CPU/memory limits;
- acceptable application overhead.

Do not enable tail sampling unless all spans for a trace reach the same collector/sampling decision point.

### 13.5 Alerts

The repo provides templates. Before paging humans:

- tune thresholds from real baseline traffic;
- decide severity levels;
- define owners and escalation policy;
- route alerts in Alertmanager;
- test notification delivery;
- add silencing/on-call docs.

Recommended rollout:

1. Load rules in staging.
2. Observe for false positives without paging.
3. Tune thresholds.
4. Enable low-severity notifications.
5. Enable paging only for user-impacting alerts.

### 13.6 S3/RustFS checks

The current blackbox alert checks the internal API metrics endpoint. For real storage paging, add a safe S3 synthetic check that uses:

- non-production test bucket or prefix;
- least-privilege credentials;
- HEAD/PUT/GET/DELETE lifecycle;
- no customer object keys;
- credentials outside git.

### 13.7 Privacy audit

Before centralized production log/trace ingestion:

1. Generate staging traffic covering uploads, shares, protected shares, ZIP downloads, failures, deletes, Celery tasks.
2. Query Loki for forbidden patterns.
3. Inspect Tempo span attributes.
4. Confirm Prometheus labels are bounded.
5. Fix any raw customer or secret data before enabling production retention.

Forbidden telemetry examples:

- raw `Authorization` header;
- JWT/refresh token;
- share password;
- cookie;
- presigned URL;
- raw S3 object key or filename;
- raw IP address;
- full User-Agent;
- private notes;
- raw user/share/project/gallery/photo IDs as labels;
- exception message as a label.

## 14. Suggested staging rollout order

1. Deploy code with `OTEL_ENABLED=false` first if you want safest rollout.
2. Confirm app still works and `/metrics` is private but scrapeable.
3. Deploy Prometheus/Grafana/Loki/Tempo/Collector/Alloy stack in staging.
4. Enable `LOG_FORMAT=json` for app/worker.
5. Enable Prometheus scraping of `/metrics` and exporters.
6. Verify dashboards receive metrics.
7. Enable OTel export with low or moderate sampling.
8. Verify traces in Tempo.
9. Enable alert rules but route to non-paging channel.
10. Burn in for 24-72 hours.
11. Tune thresholds.
12. Enable production-style routing/paging.

## 15. Rollback plan

### Local rollback

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.local \
  down
```

### App-side telemetry rollback

If the collector or tracing causes trouble:

- set `OTEL_ENABLED=false`, or
- unset `OTEL_EXPORTER_OTLP_ENDPOINT`, or
- remove the observability Compose overlay from the local command.

The app is designed to degrade gracefully when Redis/presigned cache/observability backends are unavailable.

### Production rollback

1. Disable OTel export first if traces are causing app-side pressure.
2. Keep `/metrics` if safe; metrics are low-risk and useful during rollback.
3. Disable noisy alert routes instead of deleting rules.
4. Stop log shipping if Loki/shipper causes resource pressure.
5. Preserve recent logs/metrics/traces long enough for incident review when possible.

## 16. When adding new telemetry later

Follow these rules:

- Add metrics in `src/viewport/metrics.py`.
- Keep labels low-cardinality.
- Never label metrics with raw IDs, object keys, filenames, IPs, URLs, user agents, exception messages, or request IDs.
- Use `safe_id`, `safe_object_key`, `safe_exception_summary`, `redact_mapping`, and related helpers from `src/viewport/telemetry_safety.py`.
- Prefer route templates over raw paths.
- Prefer enum outcomes like `success`, `failure`, `partial`, `not_found`, `forbidden`, `expired`, `quota_exceeded`.
- Add or update tests in `tests/test_metrics.py`, `tests/test_observability_logging.py`, or `tests/test_observability_setup.py`.
- Update dashboards/alerts/runbooks if the new signal is operationally important.

## 17. Quick “happy path” command list

For local use when everything is already configured:

```bash
cp -n .env.observability.example .env.observability.local

docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --env-file .env.observability.local \
  up -d --build

curl -fsS http://localhost:9090/-/ready
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:13133/
curl -fsS http://localhost:3100/ready
curl -fsS http://localhost:3200/ready
curl -fsS http://localhost:8000/metrics | head
```

Then open Grafana: <http://localhost:3000>.

## 18. Related docs

- `docs/observability-monitoring.md`
- `docs/observability-monitoring-plan.md`
- `docs/deployment/monitoring.md`
- `docs/deployment/observability-dependency-report.md`
- `docs/runbooks/api-down.md`
- `docs/runbooks/api-error-rate.md`
- `docs/runbooks/api-latency.md`
- `docs/runbooks/celery-backlog.md`
- `docs/runbooks/disk-space.md`
- `docs/runbooks/observability-pipeline.md`
- `docs/runbooks/postgres-saturation.md`
- `docs/runbooks/redis-unavailable.md`
- `docs/runbooks/s3-errors.md`
