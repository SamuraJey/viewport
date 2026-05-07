# План внедрения production-ready Observability и мониторинга для Viewport

Дата: 2026-04-29
Статус: repository baseline внедрён (2026-05-07); production rollout остаётся зоной владельца.
Scope: FastAPI backend, React/Vite frontend, Postgres, RustFS/S3, Valkey/Redis, Celery worker/beat, Docker Compose/production host.

## 0. Снимок внедрения (2026-05-07)

В репозитории добавлены runtime-код и конфигурация для базового observability:

- `/metrics` сохранён и расширен domain metrics для API/upload/share/S3/Redis/cache/Celery/background workflows.
- Добавлены production JSON logs, correlation fields, request/task context, route normalization и redaction/fingerprint helpers.
- Добавлен safe-disabled OpenTelemetry setup для FastAPI/Celery, span export sanitizer и dependency report для Python 3.14.
- Добавлен local monitoring stack: Prometheus, Grafana, Loki, Tempo, OTel Collector, Alloy, Alertmanager, exporters.
- Collector privacy processor удаляет raw HTTP path/url/query/IP/User-Agent/SQL/object-key attributes, а Alloy не индексирует high-cardinality `trace_id`/`span_id`/`request_id` как Loki labels.
- Добавлены dashboards, alert rules, monitoring deployment doc и runbooks.

Остаётся human/operator-owned: private scrape-доступ к `/metrics`, реальные alert receivers/secrets, TLS/auth/SSO, retention/disk budgets, production collector topology, SLO thresholds и staging burn-in.

## 1. Цель и критерий готовности

После полного внедрения этого плана у проекта должен быть production-ready мониторинг, который позволяет:

- видеть состояние сервиса через Grafana dashboards;
- получать метрики backend/API, Celery, Postgres, Valkey/Redis, RustFS/S3, reverse proxy/host/container runtime;
- расследовать инциденты через связку **метрики → трейсы → логи**;
- получать алёрты через Alertmanager/Grafana OnCall/Telegram/Email/другой канал;
- иметь SLO/SLI для доступности, ошибок, latency, фоновых задач и инфраструктурных ресурсов;
- хранить observability-конфигурацию как код в репозитории;
- не утекать PII, токены, share-link passwords, presigned URLs и приватные gallery notes в логи/метрики/трейсы.

## 2. Текущее состояние проекта

Факты из репозитория:

- `src/viewport/main.py` подключает `setup_metrics(app)`.
- `src/viewport/metrics.py` уже использует `prometheus-fastapi-instrumentator` и экспонирует `/metrics`.
- `src/viewport/logging_config.py` пишет цветные stdout-логи; это удобно локально, но неудобно для production JSON ingestion.
- `src/viewport/logger.py` уже умеет писать отдельные structured JSON event messages для public/share событий.
- `src/viewport/celery_app.py` запускает Celery worker/beat, Redis broker/result backend, периодические задачи cleanup/reconcile.
- `docker-compose.yml` содержит `app`, `postgres`, `s3-service`, `redis`, `celery_worker`; отдельного monitoring stack пока нет.
- `pyproject.toml` уже содержит `prometheus-fastapi-instrumentator`, но не содержит OpenTelemetry SDK/exporters/instrumentations.

## 3. Источники и опорные практики

Проверено через Context7:

- OpenTelemetry: использовать `service.name`/resource attributes, OTLP exporters, log correlation, Collector pipelines, sampling/tail sampling для ошибок и slow traces.
- OpenTelemetry Python: возможны OTLP traces/metrics exporters и Prometheus exporter/reader; для Python-сервисов важна ранняя инициализация instrumentation.
- Prometheus: scrape configs, rule files, `for`, labels/annotations, Alertmanager routing, alert relabeling.
- Grafana: provisioning datasources/dashboards/alerting as code; Prometheus + Loki + Tempo как единый observability workflow; Tempo datasource links to logs/metrics.

## 4. RALPLAN-DR summary

### 4.1 Principles

1. **Vendor-neutral first**: OpenTelemetry + Prometheus/Grafana-compatible formats, чтобы не привязываться к SaaS.
2. **Observability as Code**: все dashboards, rules, datasources, collector/prometheus/loki/tempo configs — в репозитории.
3. **Privacy by default**: не логировать пароли, JWT, cookies, presigned URLs, raw IP, email без необходимости, private notes, full object keys если они чувствительны.
4. **Actionable alerts only**: алёрт должен иметь severity, owner/runbook, impact и понятное действие.
5. **Incremental rollout**: сначала локальный/staging stack, затем production с сохранением rollback path.

### 4.2 Decision drivers

1. **Скорость диагностики инцидентов**: нужен переход от алёрта к dashboard, trace и логам за минуты.
2. **Низкая операционная сложность для self-hosted проекта**: стек должен быть понятен и обслуживаем одним владельцем.
3. **Безопасность и стоимость**: минимальный риск утечек и возможность начать без платного SaaS.

### 4.3 Рассмотренные варианты

#### Вариант A — минимальный Prometheus + Grafana только для метрик

Компоненты: текущий `/metrics`, Prometheus, Grafana, Alertmanager, exporters для Postgres/Redis/node/cAdvisor.

Плюсы:

- быстрее всего внедрить;
- мало новых зависимостей в Python-коде;
- уже есть начальная точка `/metrics`.

Минусы:

- слабая диагностика причин: нет distributed traces и лог-корреляции;
- Celery/S3/background failures сложнее расследовать;
- меньше production readiness для инцидентов.

Вердикт: хороший этап 1, но недостаточно как конечное целевое состояние.

#### Вариант B — рекомендуемый: LGTM/OTel stack

Компоненты: OpenTelemetry SDK/instrumentations в app/worker, OTel Collector, Prometheus, Alertmanager, Grafana, Loki, Tempo, exporters.

Плюсы:

- метрики, логи и трейсы связаны через `trace_id`, `span_id`, `service.name`, `deployment.environment`;
- vendor-neutral OTLP;
- Grafana dashboards и alerting можно хранить as code;
- подходит для Docker Compose сейчас и может мигрировать в Kubernetes/managed stack позже.

Минусы:

- больше конфигов и компонентов;
- нужно аккуратно настроить sampling и retention;
- production-инфраструктура потребует участия владельца.

Вердикт: целевой вариант.

#### Вариант C — managed SaaS observability

Компоненты: OpenTelemetry в коде, экспорт в Grafana Cloud/Datadog/New Relic/Honeycomb/Sentry и т.п.

Плюсы:

- меньше поддержки self-hosted хранилищ;
- готовые alerting/on-call возможности;
- проще масштабировать retention.

Минусы:

- стоимость и vendor lock-in;
- нужно разбираться с передачей данных наружу и privacy;
- инфраструктурные credentials/API keys нельзя безопасно настраивать агенту без участия владельца.

Вердикт: допустимо позже, если self-hosted обслуживание станет дороже SaaS.

## 5. Целевая архитектура

```text
Browser/Clients
   |
Reverse proxy / TLS / access logs
   |
FastAPI app ---------------------> /metrics scrape -------------------+
   |                               OTLP traces/logs/metrics           |
   |                                                                  v
Celery worker/beat --------------> OTLP traces/logs/metrics ---> OpenTelemetry Collector
   |                                                                  |
   +-- Redis broker/cache                                              +--> Tempo   (traces)
   +-- Postgres                                                        +--> Loki    (logs)
   +-- RustFS/S3                                                       +--> Prometheus/remote_write (metrics)

Exporters:
- postgres_exporter -> Prometheus
- redis_exporter/valkey-compatible exporter -> Prometheus
- node_exporter -> Prometheus
- cAdvisor -> Prometheus
- RustFS native metrics endpoint if available, otherwise blackbox/exporter probes

Grafana:
- Datasources: Prometheus, Loki, Tempo
- Dashboards: service overview, API, Celery, DB, Redis, S3/storage, host/container, public-share funnel, SLO
- Alerts: Prometheus rules and/or Grafana managed alerts
- Runbooks: docs/runbooks/*.md linked from annotations
```

### 5.1 Ownership по telemetry-сигналам

| Signal | Primary producer | Transport | Storage/query backend | Alert source | Owner in repo | Owner in production |
|---|---|---|---|---|---|---|
| HTTP/API metrics | FastAPI `/metrics`, custom metrics | Prometheus scrape | Prometheus | Prometheus rules / Grafana alerts | Repository automation can implement `src/viewport/metrics.py` and tests | Human secures scrape network and thresholds |
| Business metrics | FastAPI/Celery explicit counters/histograms | Prometheus scrape or OTel metrics later | Prometheus | Prometheus rules | Repository automation can add wrappers and low-cardinality labels | Human approves privacy and business semantics |
| Infra metrics | exporters: Postgres, Redis, node, cAdvisor, RustFS/blackbox | Prometheus scrape | Prometheus | Prometheus rules | Repository automation can provide configs | Human deploys credentials, ports, volumes |
| Traces | FastAPI + Celery OpenTelemetry SDK | OTLP -> Collector | Tempo | Derived metrics / trace exemplars | Repository automation can instrument after dependency gate | Human approves sampling/retention/perf budget |
| Logs | app/worker stdout JSON, reverse proxy logs | Docker logs -> Alloy/Promtail or OTel logs | Loki | LogQL/Grafana alerts only for select cases | Repository automation can implement JSON/redaction | Human validates real prod samples and retention |
| Synthetic checks | blackbox/exporter or scripts | Prometheus scrape | Prometheus | Prometheus rules | Repository automation can create probes/templates | Human points probes at real production URLs/credentials |

Rule of thumb: application-level telemetry can be mostly prepared by repository automation; production transport, storage, access control, retention, and notification routing remain operator-owned.

### 5.2 Phased signal rollout

1. **Metrics first**: use existing `/metrics` as the fastest route to useful dashboards and basic alerts.
2. **Logs second**: switch production logs to structured JSON and ingest into Loki; this is needed before trace/log correlation is useful.
3. **Traces third**: add OpenTelemetry after dependency compatibility with Python 3.14 is verified.
4. **SLOs last**: only after 1-2 weeks of baseline metrics, tune SLO thresholds and burn-rate alerts.

## 6. Репозиторная структура baseline

Реализованный baseline использует отдельный Compose override и каталог `config/observability/`,
чтобы runtime-конфиги не смешивались с prose-документацией:

```text
docker-compose.observability.yml
.env.observability.example
config/observability/
  prometheus/
    prometheus.yml
    rules/
      viewport-alerts.yml
  alertmanager/
    alertmanager.yml.example
  otel-collector.yaml
  loki/
    loki.yml
  alloy/
    config.alloy
  tempo/
    tempo.yml
  blackbox.yml
  grafana/
    provisioning/
      datasources/datasources.yaml
      dashboards/dashboards.yaml
    dashboards/
      viewport-overview.json
      viewport-api.json
      viewport-celery.json
      viewport-infra.json
      viewport-slo.json

docs/
  observability-monitoring-plan.md       # этот документ
  observability-monitoring.md            # concise English plan/status
  deployment/
    monitoring.md
    observability-dependency-report.md
  runbooks/
    api-down.md
    api-error-rate.md
    api-latency.md
    celery-backlog.md
    postgres-saturation.md
    redis-unavailable.md
    s3-errors.md
    disk-space.md
```

## 7. Метрики: что собирать

### 7.1 Backend/FastAPI

Уже есть baseline через `prometheus-fastapi-instrumentator`. Его нужно довести до production формы:

- request rate по route/method/status;
- error rate 4xx/5xx;
- latency histogram p50/p95/p99;
- in-progress requests;
- response size, если полезно;
- исключить high-cardinality labels: raw path с UUID/share_id/object_key, query string, filenames.

Дополнительно custom metrics:

- upload reservation/confirmation counts;
- photo upload confirm success/failure;
- thumbnail generation enqueue rate;
- presigned URL cache hit/miss/error;
- share unlock success/failure, но без паролей/IP/raw user-agent;
- public share opens/downloads/selections, агрегированно и privacy-safe;
- storage quota usage ratio per user **не** как label `user_id`, а как агрегаты/buckets.

### 7.2 Celery

Нужно покрыть:

- task started/succeeded/failed/retried/revoked by task name;
- task runtime histogram;
- retry count;
- queue length/backlog;
- worker heartbeat/up;
- beat schedule heartbeat;
- orphan cleanup/reconcile results;
- thumbnail batch success/skipped/failed counts;
- dead-letter/rejected/lost task signals, если возможно.

Возможные подходы:

1. Celery signals + Prometheus/OpenTelemetry custom metrics в worker process.
2. Отдельный celery exporter/Flower exporter, если выбран и проверен.
3. Redis queue depth через exporter/custom probe.

Рекомендация: начать с Celery signals в коде + Redis queue depth exporter/probe. Это контролируемо и тестируемо.

### 7.3 Postgres

Через `postgres_exporter`:

- availability/up;
- active connections, max connections, waiting locks;
- transaction rate;
- query duration if enabled safely;
- table/index bloat later, not обязательно в первом этапе;
- deadlocks;
- replication только если появится replica;
- disk usage через node exporter/container volumes.

### 7.4 Valkey/Redis

Через redis exporter:

- up;
- connected clients;
- memory used/max ratio;
- evictions;
- command latency/rate;
- keyspace hits/misses;
- blocked clients;
- broker queue lengths for Celery.

### 7.5 RustFS/S3-compatible storage

Сначала выяснить, какие native metrics RustFS отдаёт в текущей версии. Если есть Prometheus endpoint — scrape его. Если нет:

- blackbox probe для S3 API health;
- synthetic check: HEAD/PUT/GET/DELETE тестового объекта в отдельном bucket/prefix;
- лог/метрики ошибок boto/aioboto3 в app/worker;
- storage volume disk usage через node exporter/cAdvisor.

### 7.6 Frontend

Минимальный production-ready уровень:

- availability synthetic check для публичного frontend URL;
- JS error reporting можно добавить отдельным этапом через Sentry/OpenTelemetry web или self-hosted альтернативу;
- web vitals/RUM — не блокер первого backend-focused monitoring, но полезно позже.

### 7.7 Host/container/reverse proxy

Нужно собирать:

- CPU/memory/disk/network host;
- container restarts, OOM, memory/CPU throttling;
- reverse proxy 5xx/4xx/latency/access logs;
- TLS certificate expiry;
- backup freshness for Postgres/storage.

Это почти полностью зона production-инфраструктуры владельца.

## 8. Логи

### 8.1 Изменения в приложении

Текущий `ColoredFormatter` оставить для local dev, но добавить production JSON formatter:

- env var: `LOG_FORMAT=json|colored`, default local `colored`, production `json`;
- поля: `timestamp`, `level`, `logger`, `message`, `service.name`, `environment`, `trace_id`, `span_id`, `request_id`, `user_id_hash` при необходимости;
- redact middleware/filter для секретов: `Authorization`, cookies, JWT, share passwords, presigned URL query params, S3 access keys;
- единый request id middleware, прокидывать `X-Request-ID`.

### 8.1.1 Конкретная remediation для текущих чувствительных логов

Перед включением Loki/централизованного хранения нужно пройти текущие места логирования и убрать/замаскировать чувствительные значения:

**Production gate:** это не рекомендация, а блокирующее условие Phase 3. Repository baseline теперь включает formatter-level redaction, generic `*_id` fingerprinting, public-share route normalization, explicit S3 object-key hashing, share password-denial safe fields, OpenTelemetry span sanitization, collector privacy deletion, and Loki low-cardinality label checks. До production rollout владелец всё ещё должен вручную проверить staging log/trace samples.

- `src/viewport/s3_service.py`: raw object keys сейчас логируются во многих местах (`Successfully uploaded object: %s`, `Failed to upload/download/delete/head object %s`, `Generated presigned URL/PUT for %s`, `Updated/Got/Deleted tags for %s`, folder `prefix`). До централизованного логирования заменить их на `object_key_hash`, `object_key_kind`/operation, optional extension/content type, но не raw key. Для локального debug raw key можно разрешить только за отдельным `LOG_SENSITIVE_DEBUG=true`, который запрещён в production. Сообщения вроде `AsyncS3Client initialized: endpoint=%s, bucket=%s, region=%s` допустимы только если endpoint/bucket не считаются секретом; access/secret keys нельзя логировать никогда.
- `src/viewport/s3_utils.py`: `Creating sync S3 client for endpoint: %s` оставить только в DEBUG или маскировать hostname в production, если endpoint внутренний.
- `src/viewport/api/gallery.py`: логи URL generation performance безопасны, но не должны включать сами presigned URLs, object keys, filenames или query params.
- `src/viewport/api/public.py`, `src/viewport/sharelink_access.py`, `src/viewport/logger.py`: structured events должны хранить `share_id` только если он не является секретом доступа; если `share_id` фактически bearer-token, перейти на hash/short fingerprint для logs/metrics. В `_log_denied_password_attempt()` raw `client_ip` и `user_agent` должны быть удалены или заменены на privacy-safe поля: `client_ip_hash` с daily salt / deployment salt, `user_agent_family` или `user_agent_hash`, но не полный header. Для brute-force диагностики достаточно hash+rate, а не исходных значений.
- `src/viewport/background_tasks.py`: не логировать raw S3 object keys в warning/error на production без хеширования или redaction; object keys могут содержать пользовательский контекст/filename.
- `src/viewport/auth_utils.py` и auth API: явно запретить logging `Authorization`, cookies, refresh tokens, JWT claims кроме safe user fingerprint.
- Добавить тесты redaction: строки с `Authorization: Bearer`, `password`, `share_password`, `X-Amz-Signature`, `AWSAccessKeyId`, `token`, `cookie` не должны попадать в formatter output.
- Добавить тесты privacy logging для текущих известных точек: `s3_service` не выводит raw object key/prefix в production mode; `sharelink_password_denied` не содержит raw `client_ip`/`user_agent`.

Практическое правило: для production logs использовать allowlist полей, а не blacklist. Если поле нужно для корреляции, хранить `hash(value)` или короткий fingerprint.

Blocking checklist before Phase 3 completion:

- [x] `src/viewport/s3_service.py` не пишет raw object key/prefix ни на `info`, ни на `warning`, ни на `error` в production mode.
- [x] `src/viewport/sharelink_access.py:_log_denied_password_attempt()` не пишет raw `client_ip`.
- [x] `src/viewport/sharelink_access.py:_log_denied_password_attempt()` не пишет полный raw `user_agent`.
- [x] Тесты доказывают, что forbidden values не попадают в JSON logs / exported spans / Loki labels.
- [ ] Один staging log sample вручную проверен владельцем перед production rollout.

### 8.2 Доставка логов

Варианты:

- Docker logs -> Promtail/Grafana Alloy -> Loki;
- OTel logs -> OTel Collector -> Loki/OTLP backend;
- managed logs provider later.

Рекомендация: для Docker Compose проще начать с Alloy/Promtail, но сохранить trace/log correlation через JSON fields.

### 8.3 Retention

Стартовые значения:

- logs: 7-14 дней локально;
- traces: 3-7 дней;
- metrics: 30-90 дней;
- long-term metrics через remote_write/managed backend позже.

Точные значения должен утвердить владелец с учётом диска.

## 9. Трейсы

### 9.1 Backend instrumentation

Добавить OpenTelemetry Python:

> Gate: перед изменением `pyproject.toml` нужно проверить, что выбранные пакеты OpenTelemetry поддерживают текущий runtime проекта `requires-python = ">=3.14, <3.15"`. Если хотя бы один нужный пакет не публикует wheel/metadata для Python 3.14, Phase 4 блокируется до выбора альтернативы: отложить OTel, использовать только Prometheus/logs, снизить Python runtime, либо выбрать совместимые prerelease/версии после явного approval.

- FastAPI/Starlette instrumentation;
- SQLAlchemy instrumentation;
- Redis instrumentation;
- requests/httpx if used;
- boto/botocore instrumentation для S3 paths;
- logging correlation;
- manual spans вокруг дорогих бизнес-операций:
  - batch-presigned;
  - batch-confirm;
  - thumbnail enqueue;
  - zip generation;
  - public share access;
  - presigned URL cache batch generation;
  - selection submit/export.

### 9.2 Celery instrumentation

- instrument Celery producer/worker;
- propagate trace context from request that enqueues task to worker task;
- spans per task execution;
- attributes: `celery.task_name`, `gallery_id` maybe hashed/low-cardinality if safe, batch size, result status;
- avoid raw object keys/filenames as span attributes unless sanitized.

### 9.3 Sampling

Initial policy:

- local/staging: sample 100%;
- production head sampling: 5-20% success traces;
- always keep error traces;
- always keep slow traces over thresholds;
- use OTel Collector tail sampling when traffic/volume оправдывают сложность.

### 9.4 Dependency compatibility gate for Python 3.14

Перед Phase 4 нужно подготовить отдельный dependency report:

```text
uv add --dry-run opentelemetry-sdk opentelemetry-exporter-otlp \
  opentelemetry-instrumentation-fastapi \
  opentelemetry-instrumentation-sqlalchemy \
  opentelemetry-instrumentation-redis \
  opentelemetry-instrumentation-celery \
  opentelemetry-instrumentation-botocore
```

Acceptance gate:

- dependency resolver succeeds on Python 3.14;
- import smoke test passes in app and Celery worker contexts;
- app boots with `OTEL_ENABLED=false`;
- app boots with `OTEL_ENABLED=true` and collector unavailable without crashing, or fails only if explicitly configured fail-fast for staging;
- no dependency introduces a production-incompatible license or native build burden.

Если gate не проходит, документированный fallback: завершить production metrics/logs/alerts без traces и создать отдельный migration task для OTel compatibility.

## 9.5 Celery worker/beat topology clarification

Сейчас `docker-compose.yml` запускает один контейнер `celery_worker` командой:

```text
celery -A src.viewport.celery_app worker --loglevel=info --concurrency=4 --max-tasks-per-child=500 --beat
```

Это означает, что worker и beat совмещены в одном процессе/контейнере. Для monitoring плана это важно:

- heartbeat worker и freshness beat schedule нужно различать как разные signals;
- если позже будет несколько worker replicas, `--beat` должен остаться только у одного singleton beat, иначе периодические cleanup/reconcile задачи могут дублироваться;
- dashboard должен показывать worker liveness отдельно от beat schedule liveness;
- production recommendation: разделить на `celery_worker` и `celery_beat` контейнеры до масштабирования worker replicas.

Repository automation can:

- подготовить compose diff для разделения worker/beat;
- добавить метрики task/beat freshness;
- добавить dashboard panels.

Human/operator must:

- решить, будет ли scaling Celery worker replicas;
- гарантировать singleton beat в production;
- подтвердить deployment/rollback порядок.

## 9.6 Frontend observability baseline

Frontend не должен оставаться полностью невидимым. Минимальный baseline до RUM/Sentry:

- synthetic uptime check публичного frontend URL;
- synthetic check login/public share route, если можно безопасно без реальных credentials;
- reverse proxy metrics/logs по frontend static responses: 4xx/5xx, latency, bandwidth;
- browser error reporting как отдельный optional Phase 9 после privacy review.

Repository automation can:

- создать blackbox exporter targets для frontend routes;
- добавить Grafana panels на reverse proxy metrics/logs, если формат логов известен;
- подготовить optional design для web vitals/error reporting.

Human/operator must:

- дать production URLs;
- настроить reverse proxy log export;
- решить, допустим ли SaaS/Sentry или нужен self-hosted вариант.

## 10. Dashboards

### 10.1 `Viewport Overview`

Panels:

- service up/down by component;
- API request rate/errors/latency p95/p99;
- Celery queue backlog and failures;
- Postgres connections/locks/errors;
- Redis availability/memory/evictions;
- RustFS/S3 health/errors;
- host disk/memory/CPU;
- active alerts table;
- links to runbooks.

### 10.2 `Viewport API`

Panels:

- RPS by route group;
- 5xx/4xx rate;
- latency histogram and p50/p95/p99;
- slowest endpoints;
- auth failures;
- upload confirm failures;
- presigned cache hit ratio;
- zip download duration/size;
- public share access status codes.

### 10.3 `Viewport Celery`

Panels:

- task throughput by task name;
- failed/retried tasks;
- task duration p95/p99;
- queue length;
- worker count/heartbeat;
- beat schedule freshness;
- thumbnail success/failure/skipped;
- cleanup/reconcile counts.

### 10.4 `Viewport Database`

Panels:

- Postgres up;
- connections/max ratio;
- locks/deadlocks;
- transaction rate;
- slow query indicator if available;
- disk usage.

### 10.5 `Viewport Redis/Valkey`

Panels:

- up;
- memory ratio;
- evictions;
- blocked clients;
- ops/sec;
- cache hit/miss;
- Celery broker queue depth.

### 10.6 `Viewport Storage/S3`

Panels:

- S3 API synthetic check;
- app-side S3 error count;
- upload/download/thumbnail object operation latency;
- bucket/volume disk usage;
- failed object deletes.

### 10.7 `Viewport SLO`

Panels:

- availability SLI;
- latency SLI;
- error budget burn;
- background processing SLO;
- recent incidents/alert history.

## 11. Алёрты

Все алёрты должны иметь:

- `severity`: `info|warning|critical`;
- `service`: `viewport-api|viewport-celery|postgres|redis|s3|host|frontend`;
- `environment`;
- `summary`, `description`, `runbook_url`;
- route в Alertmanager/Grafana notification policy.

### 11.1 Critical page alerts

- `ViewportAPIDown`: app target `up == 0` for 2-5m.
- `High5xxRate`: 5xx ratio выше 2-5% for 5-10m.
- `CriticalAPILatency`: p99 выше agreed threshold for 10m.
- `PostgresDown` or connection refused.
- `PostgresConnectionSaturation`: >85-90% max connections for 10m.
- `RedisDown`: broker/cache недоступен for 2-5m.
- `CeleryNoWorkers`: worker heartbeat absent.
- `CeleryQueueBacklogCritical`: backlog растёт/выше threshold for 10-15m.
- `S3Unavailable`: synthetic S3 check fails.
- `DiskWillFillSoon`: disk прогноз/usage >85-90%.
- `TLSCertificateExpiringSoon`: <14 дней.

### 11.2 Warning alerts

- elevated 4xx/auth failures;
- presigned cache degraded/unavailable longer threshold;
- thumbnail failure rate elevated;
- cleanup/reconcile tasks failing;
- Redis evictions > 0;
- Postgres deadlocks;
- high CPU/memory sustained;
- Grafana/Prometheus/Loki/Tempo targets down;
- backup stale.

### 11.3 SLO burn-rate alerts

После baseline периода 1-2 недели задать SLO, например:

- API availability: 99.5% successful non-5xx requests over 30d;
- API latency: 95% requests under 500ms or agreed route-specific threshold;
- upload confirmation: 99% successful confirmed uploads not stuck >10m;
- thumbnail processing: 99% confirmed photos reach SUCCESSFUL or FAILED terminal state within 15m.

Burn-rate examples:

- fast burn: 5m/1h window for paging;
- slow burn: 30m/6h or 2h/24h for ticket/warning.

Точные thresholds должен утвердить владелец после baseline.

## 12. Phased implementation plan

### Phase 0 — Decisions and baseline inventory

Deliverables:

- выбрать production deployment target: current Docker Compose host, TrueNAS compose, Kubernetes, managed cloud;
- выбрать notification channels;
- определить domains/ports/VPN/firewall for Grafana/Prometheus;
- определить retention и disk budget;
- определить initial SLO targets;
- описать privacy policy для telemetry.

Repository automation can do:

- подготовить questionnaire;
- создать docs template;
- просканировать repo и составить inventory;
- подготовить пример `.env.observability.example`.

Human/operator must do:

- подтвердить production topology, доступы, DNS/TLS/firewall;
- выбрать/настроить notification channels;
- решить, будет ли Grafana публична, за VPN, за reverse proxy или basic/OAuth auth;
- выделить disk/volume для retention.

### Phase 1 — Local/staging monitoring stack as code

Deliverables:

- `docker-compose.observability.yml` with Prometheus, Alertmanager, Grafana, Loki, Tempo, OTel Collector, Alloy, and exporters;
- `config/observability/**` with Prometheus, alert, datasource, dashboard, Loki, Tempo, OTel Collector, Alloy, and blackbox configs;
- Prometheus scrape config for app `/metrics`, postgres_exporter, redis_exporter, node_exporter/cAdvisor;
- Grafana datasource provisioning;
- smoke dashboard with app up/RPS/latency/errors.

Repository automation can do:

- generate Compose/config files;
- wire local services to existing `backend` network;
- add README run instructions;
- add CI/static validation where possible (`promtool check rules`, config lint).

Human/operator must do:

- confirm host ports and network constraints;
- decide whether monitoring stack runs on same host or separate host;
- provide production secrets/passwords outside git.

### Phase 2 — App metrics hardening

Deliverables:

- configure `prometheus-fastapi-instrumentator` with low-cardinality labels;
- add custom metrics module for uploads, presigned cache, S3 operations, public share flows, Celery enqueue outcomes;
- add tests for metrics registration and no duplicate collectors;
- ensure `/metrics` is protected at network layer in production or only scraped internally.

Repository automation can do:

- implement Python metrics wrappers;
- add unit tests;
- add route grouping/sanitization;
- update docs.

Human/operator must do:

- ensure `/metrics` is not publicly exposed;
- define acceptable business metric labels and privacy boundaries.

### Phase 3 — Structured logs and log ingestion

Deliverables:

- production JSON logging mode;
- request id middleware;
- trace/log correlation fields;
- redaction filter;
- Loki ingestion config;
- Grafana log panels linked from traces.

Repository automation can do:

- implement JSON formatter and tests;
- add redaction tests;
- update existing structured logger to share fields;
- add Alloy/Promtail config templates.

Human/operator must do:

- decide log retention;
- ensure Docker log driver/permissions fit production host;
- validate no secrets in real production samples.

### Phase 4 — OpenTelemetry traces

Deliverables:

- add OTel dependencies to `pyproject.toml` after approval;
- initialize OTel in FastAPI and Celery worker safely;
- OTLP exporter to Collector;
- instrument FastAPI, SQLAlchemy, Redis, boto/botocore, Celery;
- manual spans for core workflows;
- Tempo datasource and trace dashboards.

Repository automation can do:

- code instrumentation;
- tests that app boots with OTel disabled/enabled;
- config examples and env vars;
- span attribute review for PII/high-cardinality risk.

Human/operator must do:

- approve new dependencies;
- choose sampling and retention based on production traffic;
- validate performance overhead in staging.

### Phase 5 — Celery/background observability

Deliverables:

- Celery task metrics via signals;
- queue depth metrics;
- worker heartbeat dashboard;
- alerts for backlog/failures/no workers;
- trace propagation from API enqueue to worker execution.

Repository automation can do:

- implement metrics/traces around Celery tasks;
- add tests for signal handlers/eager mode compatibility;
- dashboard JSON and rules.

Human/operator must do:

- set thresholds from real workload;
- decide worker scaling strategy when alerts fire.

### Phase 6 — Infra monitoring

Deliverables:

- Postgres exporter dashboard/alerts;
- Redis exporter dashboard/alerts;
- RustFS/S3 metrics or synthetic checks;
- node/container dashboard/alerts;
- backup freshness and TLS expiry checks.

Repository automation can do:

- prepare exporter configs and dashboards;
- write blackbox/synthetic probe examples;
- write runbooks.

Human/operator must do:

- deploy exporters with credentials/network permissions;
- add firewall rules;
- configure real backup/TLS checks;
- secure Grafana/Prometheus endpoints.

### Phase 7 — Alerting, runbooks, and SLOs

Deliverables:

- Prometheus alert rule groups;
- Alertmanager routing config example;
- Grafana notification policy if using Grafana-managed alerts;
- `docs/runbooks/*.md`;
- SLO dashboard and burn-rate alerts;
- incident drill checklist.

Repository automation can do:

- draft rules, dashboards, runbooks;
- add promtool validation tests;
- create example notification templates.

Human/operator must do:

- insert real receiver secrets;
- test notifications end-to-end;
- approve paging thresholds;
- perform first incident drill.

### Phase 8 — Production rollout

Deliverables:

- staging validation report;
- production deployment checklist;
- rollback plan;
- first 7-day baseline review;
- tuned thresholds and reduced alert noise.

Repository automation can do:

- generate checklist;
- analyze exported metrics snapshots/log samples if provided;
- propose threshold tuning.

Human/operator must do:

- run deployment on production host;
- validate dashboards against real traffic;
- rotate/store secrets;
- own final go/no-go.

## 13. Repository vs operator responsibility matrix

| Area | Repository automation can do autonomously | Human/operator required |
|---|---|---|
| Repo docs | Create/update docs, runbooks, checklists | Approve operational policy |
| Python metrics | Implement wrappers, tests, route sanitization | Confirm business labels/privacy |
| Logging | JSON formatter, request id, redaction tests | Inspect real prod samples for leaks |
| OpenTelemetry | Instrument app/worker, env config, tests | Approve dependencies and sampling overhead |
| Dashboards | Generate Grafana JSON/provisioning | Confirm which dashboards matter operationally |
| Alerts | Draft Prometheus/Grafana rules and runbooks | Choose channels, severity, thresholds, on-call |
| Docker monitoring stack | Add compose/config templates | Deploy, expose/secure ports, manage volumes |
| Production secrets | Add `.example` files only | Create/store real secrets |
| Grafana auth | Document options | Configure OAuth/basic/VPN/TLS |
| DNS/TLS/firewall | Produce checklist | Execute infrastructure changes |
| Backup/TLS checks | Write probes/checklist | Connect to real backup/TLS systems |
| Incident drills | Create drill scripts | Run drill and accept operational readiness |

## 14. Acceptance criteria

Production-ready baseline is complete when:

1. Grafana is reachable securely by the operator.
2. Datasources Prometheus, Loki and Tempo are provisioned and healthy.
3. `/metrics` is scraped internally and not exposed publicly.
4. Dashboards exist for overview, API, Celery, Postgres, Redis, S3/storage, host/container and SLO.
5. Logs are structured JSON in production and searchable by `service.name`, `environment`, `request_id`, `trace_id`.
6. Traces exist for FastAPI requests and Celery tasks, including request-to-task propagation for key flows.
7. Critical alert rules exist and route to a real notification channel.
8. Every critical alert links to a runbook.
9. Synthetic checks cover frontend/backend/S3 basics.
10. A staging or production fire drill has been run and documented.
11. Retention and disk usage are understood and monitored.
12. Privacy checks confirm secrets/PII are not emitted in telemetry.

## 15. Verification plan

### Code-level verification

- `just pretty`
- `just mypy`
- targeted backend tests for metrics/logging/OTel config
- `just test` if implementation changes are broad
- frontend tests only if frontend/RUM changes are added

### Config verification

- `promtool check config config/observability/prometheus/prometheus.yml`
- `promtool check rules config/observability/prometheus/rules/*.yml`
- OTel Collector dry-run/config validation in container
- Loki/Tempo/Grafana container boot smoke test
- Grafana provisioning starts without errors

### Runtime verification

- generate test API traffic and confirm RPS/latency/error panels update;
- trigger a controlled 500 and confirm error metric/log/trace correlation;
- enqueue a thumbnail task and confirm Celery metrics/traces;
- stop Redis/Postgres in staging and confirm alerts fire;
- fill a test disk threshold or fake metric in staging and confirm disk alert;
- confirm notifications are received and grouped correctly;
- verify runbook links resolve.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Metrics high cardinality explodes Prometheus | Route templating, no UUID/user_id/object_key labels, tests/review |
| Secrets/PII leak into telemetry | Redaction filters, allowlist attributes, production sample audit |
| Monitoring stack consumes too much disk | Retention limits, volume alerts, remote_write option |
| Alert fatigue | Start with few critical alerts, tune after baseline, warnings separate from pages |
| Tracing overhead | Sampling, batch exporters, staging load check |
| `/metrics` exposed publicly | Internal network only, reverse proxy deny rule, no public port |
| Celery instrumentation breaks eager tests | feature flags, test mode defaults, targeted tests |
| RustFS metrics unclear | Native metrics discovery first, fallback synthetic checks |

## 17. ADR

### Decision

Adopt a vendor-neutral LGTM/OTel observability architecture: OpenTelemetry instrumentation in application/worker, OTel Collector, Prometheus + Alertmanager for metrics/alerts, Grafana for dashboards, Loki for logs and Tempo for traces.

### Drivers

- Need production-ready diagnosis across API, background tasks and infrastructure.
- Existing project already exposes Prometheus metrics, making incremental adoption feasible.
- Self-hosted Docker Compose deployment benefits from as-code configs and no mandatory SaaS.

### Alternatives considered

- Prometheus + Grafana metrics only: rejected as final state because it lacks trace/log correlation.
- Managed SaaS only: rejected as default because it adds cost, data-sharing and vendor-lock-in decisions before local maturity.

### Consequences

- More components to operate.
- Need owner participation for production deployment, secrets, DNS/TLS/firewall, retention and notifications.
- Repo can still be prepared largely by repository automation before production rollout.

### Follow-ups

- Confirm production topology and retention budget.
- Decide notification receiver.
- Approve dependency additions for OpenTelemetry.
- Run staging fire drill before production rollout.

## 18. Suggested OMX execution paths after approving this plan

### Sequential `$ralph` path

Use when you want conservative one-owner implementation:

```text
$ralph Implement Phase 1-3 from docs/observability-monitoring-plan.md. Stop before adding OpenTelemetry dependencies unless approved. Verify with config checks and targeted tests.
```

Recommended role emphasis:

- `executor` medium: configs/code changes;
- `test-engineer` medium: metrics/logging tests;
- `verifier` high: config validation and acceptance evidence;
- `security-reviewer` medium: telemetry redaction/privacy review.

### Parallel `$team` path

Use when you want faster implementation with independent lanes:

```text
$team Implement observability monitoring plan phases 1-3 from docs/observability-monitoring-plan.md with lanes: monitoring configs, backend metrics/logging, dashboards/runbooks, verification/security review.
```

Available agent-type roster:

- `planner`: sequencing and scope control;
- `architect`: target architecture and tradeoffs;
- `executor`: backend/config implementation;
- `test-engineer`: tests and validation strategy;
- `security-reviewer`: telemetry privacy and secret redaction;
- `verifier`: acceptance evidence;
- `writer`: docs/runbooks;
- `dependency-expert`: OTel/exporter package review before Phase 4.

Suggested lane allocation:

1. Monitoring config lane (`executor`, medium): Compose, Prometheus, Grafana provisioning.
2. Backend observability lane (`executor`, medium): metrics/logging changes.
3. Runbook/dashboard lane (`writer` + `executor`, medium): dashboards JSON and docs.
4. Verification lane (`test-engineer` + `verifier`, high): promtool, tests, smoke steps.
5. Privacy lane (`security-reviewer`, medium): redaction and sensitive attribute review.

Team verification path:

- merge lanes only after config syntax checks pass;
- run targeted tests;
- boot local monitoring compose;
- generate sample traffic;
- produce final evidence table mapping acceptance criteria to command/output/screenshot or log evidence.
