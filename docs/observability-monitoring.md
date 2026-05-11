# Production Observability and Monitoring Plan for Viewport

Status: implemented repository baseline (2026-05-07); production rollout remains operator-owned.
Scope: planning, repository code/config, tests, local stack, dashboards, alerts, and runbooks.
Target project: Viewport monorepo (`FastAPI` backend, `React/Vite` frontend, `Postgres`, `RustFS`, `Valkey/Redis`, `Celery`).

## 0. Implementation Snapshot (2026-05-07)

Repository-owned implementation now includes:

- Prometheus-compatible `/metrics` preservation plus low-cardinality Viewport domain metrics in `src/viewport/metrics.py`.
- Production JSON logging, request/task/trace correlation fields, and redaction/fingerprinting helpers in `src/viewport/logging_config.py`, `src/viewport/logger.py`, and `src/viewport/telemetry_safety.py`.
- Safe-disabled OpenTelemetry setup in `src/viewport/observability.py`, including span export sanitization for raw paths/share IDs/IPs/User-Agents/SQL statements, plus Celery signal metrics/tracing hooks in `src/viewport/celery_app.py`.
- Sanitized S3/cache/share logging and app-side metrics for Redis, presigned URL cache, S3 operations, public shares, upload confirmation, and thumbnail/background workflows.
- Local monitoring stack as code in `docker-compose.observability.yml` and `config/observability/**`, with collector privacy deletion and low-cardinality Loki labels.
- Grafana dashboards, Prometheus alert templates, Alertmanager example routing, and runbooks under `docs/runbooks/**`.
- Dependency compatibility evidence in `docs/deployment/observability-dependency-report.md`.

Production-owned work remains: private `/metrics` exposure, real receiver secrets, retention/storage sizing, TLS/auth/SSO, production collector topology, SLO threshold tuning, and staging burn-in.

## 1. Context Snapshot

Viewport already has a minimal metrics foothold:

- `src/viewport/metrics.py` exposes `/metrics` with `prometheus-fastapi-instrumentator`.
- `src/viewport/main.py` calls `setup_metrics(app)` after router registration.
- `tests/test_metrics.py` checks that `/metrics` exists and returns expected metric structure.
- `src/viewport/logging_config.py` configures colored stdout logs.
- `src/viewport/logger.py` provides a small structured-event wrapper, but logs still flow through the colored formatter.
- `docker-compose.yml` currently runs only application dependencies: `app`, `postgres`, `s3-service` (RustFS), `redis` (Valkey), and `celery_worker`.
- `pyproject.toml` includes `prometheus-fastapi-instrumentator`, but no OpenTelemetry, Loki, Tempo, Grafana, Prometheus, or collector dependencies/services were observed.

External documentation facts gathered for this plan:

- OpenTelemetry production setups should prefer OTLP exporters and consistent resource attributes such as `service.name`.
- Logs, metrics, and traces should carry correlation identifiers where possible.
- Collector-based pipelines and tail sampling are preferred for production trace control, but tail sampling only works correctly when all spans for a trace reach the same sampling decision point.
- Prometheus/Grafana provisioning and Alertmanager routing should be treated as explicit production configuration, not incidental developer setup.

Additional repository concerns identified during consensus review:

- The current `/metrics` endpoint is mounted directly on the app and must not be publicly exposed in production.
- Current logs may include sensitive or high-cardinality values in some paths, including share IDs, client IP/user-agent data, and S3 object keys; implementation must audit and sanitize existing logs, not only future telemetry.
- `pyproject.toml` currently targets Python `>=3.14,<3.15`; OpenTelemetry package compatibility must be verified before committing to a dependency set.

## 2. RALPLAN-DR

### 2.1 Principles

1. **Instrument once, route flexibly.** Application code should emit standard telemetry through OpenTelemetry/Prometheus-compatible interfaces, while routing, sampling, retention, and storage decisions live in collector/operator configuration.
2. **Prefer low-cardinality, privacy-safe telemetry.** Metrics labels, trace attributes, logs, and frontend events must not include raw share passwords, auth tokens, presigned URLs, raw IPs, or personally identifying customer/photo metadata.
3. **Keep local observability reproducible.** A developer should be able to run a local monitoring stack with Compose and see representative metrics, logs, traces, dashboards, and alert rules without requiring production credentials.
4. **Separate repository automation from production operations.** Repository automation can add instrumentation, config templates, docs, tests, and local stack definitions; humans/operators must own production secrets, domains, storage retention, alert routing, budgets, and deployment-specific wiring.
5. **Alert on user-impacting symptoms first.** Alerts should prioritize availability, latency, background processing failures, storage/quota integrity, and dependency health before low-level noise.

### 2.2 Top Decision Drivers

1. **Operational usefulness:** The stack must help diagnose API latency/errors, upload and thumbnail failures, Celery backlog, S3/RustFS issues, Redis cache degradation, Postgres pressure, and public share availability.
2. **Production safety:** Telemetry must avoid sensitive data leakage, bound high-cardinality labels, and provide controlled trace sampling/retention.
3. **Incremental deliverability:** Work should build on the existing `/metrics` endpoint and logging configuration without requiring a risky all-at-once production migration.

### 2.3 Viable Options

#### Option A — Extend current Prometheus-only metrics, keep stdout logs

Add more Prometheus metrics in the FastAPI/Celery codebase, scrape `/metrics`, and rely on container stdout aggregation provided by the deployment platform.

Pros:

- Lowest implementation complexity.
- Reuses existing `prometheus-fastapi-instrumentator` and `/metrics` tests.
- Minimal new runtime dependencies in the app.

Cons:

- Weak request-to-background-task correlation.
- No distributed traces across FastAPI, Celery, DB, Redis, and S3 calls.
- Logging remains formatter-dependent and hard to query unless the platform already provides robust log aggregation.
- More future rework if production needs traces and logs later.

Best fit:

- Short-lived MVP environments or deployments that already have a platform-managed observability stack.

#### Option B — Recommended: OpenTelemetry + Prometheus/Grafana/Loki/Tempo stack, deployed incrementally

Keep Prometheus metrics compatibility, add OpenTelemetry traces/log correlation/resource attributes, introduce an OpenTelemetry Collector, and provide local/provisioned monitoring services for Prometheus, Grafana, Loki, Tempo, and Alertmanager-compatible routing.

Pros:

- Standard, vendor-neutral telemetry pipeline.
- Works locally and can be mapped to production self-hosted or managed backends.
- Enables trace correlation for FastAPI requests, SQLAlchemy DB work, Redis cache operations, S3 calls, and Celery tasks.
- Supports production controls such as collector sampling, resource attributes, and centralized pipeline policy.
- Grafana dashboards and alert rules can be versioned and reviewed.

Cons:

- More moving parts and configuration.
- Requires careful dependency and environment management.
- Production operators must still configure storage, retention, TLS, auth, routing, and resource sizing.

Best fit:

- Viewport’s current architecture: multiple services, background workers, object storage, cache, and user-facing share flows that benefit from correlation.

#### Option C — Managed observability vendor with lightweight app instrumentation

Instrument with OpenTelemetry and/or vendor SDKs, then export directly or through a collector to a managed service such as Grafana Cloud, Datadog, New Relic, Honeycomb, or cloud-provider-native tooling.

Pros:

- Reduces self-hosted operations burden.
- Strong production retention, alerting, incident workflows, and SSO features may be available out of the box.
- Collector can preserve portability if OTLP is used.

Cons:

- Recurring cost and vendor lock-in risk.
- Requires human procurement, credentials, data processing review, and retention decisions.
- Local developer stack may still be needed for reproducible testing.

Best fit:

- Production environments with small operator teams that prefer managed storage/alerting over running Grafana/Loki/Tempo/Prometheus themselves.

### 2.4 Recommended Decision

Adopt **Option B as the repository baseline**, while keeping the production export path compatible with **Option C**.

Decision summary:

- Add OpenTelemetry instrumentation and resource metadata to the backend and Celery worker.
- Preserve `/metrics` for Prometheus scraping, but require production scrape access to be private to Prometheus/collector infrastructure or blocked at the public edge.
- Use one baseline log-ingestion path: structured JSON stdout plus an explicit log shipper to Loki/vendor storage; OpenTelemetry logging support is used for correlation fields, not as a second duplicate log-export path unless a future ADR changes this.
- Add local observability Compose/provisioning templates for Prometheus, Grafana, Loki, Tempo, OpenTelemetry Collector, Grafana Alloy log shipping, and alert rules.
- Document collector topology constraints: tail sampling requires all spans for a trace to reach the same collector decision point through a central collector or trace-consistent load balancing; otherwise use head sampling.
- Document where human operators must replace local defaults with production-grade storage, auth, TLS, alert routing, retention, and secrets.

## 3. Target Observability Model

### 3.1 Signals

#### Metrics

Core dimensions should stay low-cardinality. Avoid labels containing user IDs, share IDs, project/gallery/photo IDs, object keys, filenames, presigned URLs, raw paths with IDs, or exception messages.

Backend/API metrics:

- Request count by method, normalized route, status class/status code.
- Request latency histogram by method and normalized route.
- In-flight requests.
- Error count by route/status class.
- Auth failures by broad reason, without token/user identifiers.
- Public share access outcomes: success, not found/inactive `404`, expired `410`, password required/unlocked/failed; no share ID labels.

Upload/photo pipeline metrics:

- Batch presigned requests and failure count.
- Batch confirm success/failure count.
- Pending photo count or age buckets.
- Thumbnail generation duration and failures.
- Orphan cleanup records/object deletions and failures.
- Storage quota reserve/finalize/release counters and failure count.

Celery metrics:

- Task started/succeeded/failed/retried counters by task name.
- Task runtime histograms by task name.
- Queue depth/backlog and oldest queued age if available through broker/worker inspection.
- Beat schedule health for periodic cleanup.

Dependency metrics:

- Postgres connection pool usage, query latency buckets, DB error counts.
- Redis availability/degraded state, operation latency, operation errors.
- S3/RustFS operation latency, error counts by operation class, object cleanup failures.
- Presigned URL cache hits/misses/invalidation failures.

Frontend metrics/events:

- Build/deploy version exposure.
- Web vitals or page-load timing, if privacy/consent posture allows.
- Client-side error counts and route-level failures without sensitive URL/query values.

#### Logs

Target state:

- JSON logs to stdout in production.
- Human-readable colored logs only for local development.
- Include `service.name`, deployment environment, version, trace ID, span ID, request ID, and task ID when available.
- Keep `StructuredLogger` or replace it with a consistent standard-library JSON formatter; avoid duplicate JSON-inside-colored-text output.

Sensitive data rules:

- Never log share-link passwords, password hashes, JWTs, refresh tokens, auth headers, cookies, presigned URLs, S3 secret/access keys, raw IP addresses unless explicitly approved and hashed, or full object keys if they expose customer data.
- Redact exception contexts from S3, auth, and public share paths where request data may be embedded.

#### Traces

Trace targets:

- FastAPI request spans with normalized routes.
- SQLAlchemy spans for DB calls.
- Redis client spans for cache operations.
- Botocore/aioboto3/S3 spans where supported and safe.
- Celery producer/consumer spans to connect API-triggered work with background processing.
- Manual spans around high-value workflows: batch upload confirmation, thumbnail generation, gallery deletion/purge, orphan cleanup, public share access, ZIP generation/export.

Production trace policy:

- Export OTLP to the OpenTelemetry Collector.
- Use service resource attributes for `viewport-api`, `viewport-celery`, and any future frontend telemetry collector/proxy.
- Apply collector-side tail sampling for errors, high latency, and representative baseline traffic only when collector topology preserves complete traces at the sampling decision point; otherwise use head sampling.

### 3.2 Local/Template Stack

Repository-provided local observability stack should include templates for:

- `otel-collector`: receives OTLP traces/metrics and routes them; logs are correlated in app records and shipped from stdout by Grafana Alloy unless a future ADR chooses OTLP logs.
- `grafana-alloy`: tails Docker/container stdout logs and ships JSON log lines to Loki for the local stack.
- `prometheus`: scrapes backend `/metrics`, collector metrics, and optionally exporter endpoints.
- `grafana`: dashboards and datasources provisioned from files.
- `tempo`: local trace storage.
- `loki`: local log storage.
- `alertmanager` or documented Alertmanager-compatible routing template.
- Optional exporters, depending on final implementation feasibility:
  - Postgres exporter.
  - Redis/Valkey exporter.
  - RustFS/S3-compatible metrics endpoint or documented fallback if RustFS metrics are unavailable.
  - Celery exporter or app-emitted Celery metrics.

Recommended file layout for implementation:

```text
docs/observability-monitoring.md
config/observability/otel-collector.yaml
config/observability/prometheus.yml
config/observability/alert-rules.yml
config/observability/alertmanager.yml.example
config/observability/alloy/config.alloy
config/observability/grafana/provisioning/datasources/*.yaml
config/observability/grafana/provisioning/dashboards/*.yaml
config/observability/grafana/dashboards/*.json
docker-compose.observability.yml
```

If the project prefers all deployment material under `docs/deployment/`, keep prose there but put runnable config under `config/observability/` to avoid burying operational config in documentation.


### 3.3 Production Boundary Decisions

These decisions are part of the recommended baseline and should not be left implicit during implementation:

1. **Metrics exposure:** `/metrics` may remain unauthenticated for private Prometheus scraping in local/dev, but production must restrict it by network policy, reverse-proxy rules, private listener, or equivalent scrape-only access. It must not be internet-accessible from the same public edge as user traffic.
2. **Log ingestion:** the baseline is JSON logs to stdout plus **Grafana Alloy** as the repository-local log shipper into Loki. Production operators may replace Alloy with a managed/vendor agent, but the repo implementation should provide one concrete path to avoid duplicate or ambiguous log exports. OpenTelemetry logging integration should inject trace/span correlation into log records; direct OTLP log export should be treated as a future alternative, not enabled alongside stdout shipping by default.
3. **Trace sampling:** tail sampling is allowed only with a collector topology that keeps complete traces together at the sampling decision point, such as a central collector or trace-consistent routing/load balancing. If production cannot guarantee that topology, use SDK/collector head sampling until the topology is fixed.
4. **Dependency spike:** before broad implementation, verify the selected OpenTelemetry Python packages import, instrument, and start cleanly under the project’s Python `>=3.14,<3.15` constraint and with FastAPI, Celery, SQLAlchemy, Redis, and the S3 client stack.
5. **Existing-log audit:** the first implementation phase must inspect and sanitize existing logs in public share access, S3 operations, background tasks, auth-adjacent code, and presigned URL paths.


## 4. Phased Implementation Plan

### Phase 0 — Baseline and guardrails

Goal: lock current metrics behavior and define observability safety rules before adding moving parts.

Repository work:

- Update or add documentation with the telemetry privacy rules and signal taxonomy.
- Add an existing-log audit checklist covering share IDs, client IPs/user agents, S3 object keys, auth/cookie/header data, presigned URLs, and exception contexts.
- Extend `tests/test_metrics.py` to preserve `/metrics` availability and basic content expectations.
- Add test coverage for production logging mode once logging changes are designed.
- Add a dependency compatibility spike for the proposed OpenTelemetry packages under Python `>=3.14,<3.15`; candidate packages should include `opentelemetry-api`, `opentelemetry-sdk`, `opentelemetry-exporter-otlp`, FastAPI/ASGI, SQLAlchemy, Redis, Celery, logging, and botocore instrumentation where compatible.
- Inventory current environment variables and add proposed observability variables to `.env.example` or equivalent config docs if present.

Human/operator work:

- Decide production environment names (`dev`, `staging`, `prod`) and service naming conventions.
- Decide how `/metrics` is protected in production: private network only, reverse-proxy deny rules, separate internal listener, or platform-native scrape access.
- Define alert recipients, escalation policy, quiet hours, and severity names.
- Define retention targets for metrics/logs/traces.
- Confirm privacy/compliance constraints for frontend telemetry and IP/user-agent handling.

Acceptance criteria:

- Current `/metrics` endpoint remains tested.
- Production scrape-security requirement for `/metrics` is documented as mandatory.
- Documentation lists forbidden telemetry data and accepted label/attribute patterns.
- Existing-log audit scope is documented before logging/instrumentation edits begin.
- OpenTelemetry dependency compatibility is verified or captured as a blocking risk before implementation. The spike output must list package names/versions, the command used (for example `uv add --dry-run ...` or a disposable branch install plus `uv run python -c "import ..."` smoke script), import/startup results, and any package that blocks Phase 3.
- Human decisions required for production routing/retention are captured as explicit TODOs, not guessed in code.

### Phase 1 — Backend metrics hardening

Goal: keep existing Prometheus support while adding domain-specific metrics that reflect Viewport workflows.

Repository work:

- Refactor `src/viewport/metrics.py` to centralize custom counters/histograms/gauges.
- Add low-cardinality metrics for:
  - Upload reservation/confirmation outcomes.
  - Thumbnail task outcomes and duration.
  - S3 operation failures and latency buckets.
  - Redis cache availability and presigned URL cache hit/miss behavior.
  - Public share access status categories.
  - Gallery deletion/orphan cleanup outcomes.
- Instrument likely touchpoints:
  - `src/viewport/api/*` for public/share/upload outcomes where route-level metrics are insufficient.
  - `src/viewport/background_tasks.py` for thumbnail cleanup/task metrics.
  - `src/viewport/services/redis_service.py` and `src/viewport/services/presigned_cache.py` for cache metrics.
  - `src/viewport/s3_service.py` for S3 operation metrics.
- Add or update unit/integration tests for metric registration and representative increments.

Human/operator work:

- Confirm which business workflows are critical enough for SLO dashboards.
- Provide expected volume ranges for uploads, public views, downloads, and thumbnail jobs to tune alert thresholds.

Acceptance criteria:

- `/metrics` exposes existing HTTP metrics plus Viewport domain metrics.
- Tests verify no duplicate metric registration across app/test imports.
- Custom metrics do not include high-cardinality identifiers.

### Phase 2 — Structured logs and correlation

Goal: make logs production-queryable and trace-correlatable while preserving local readability.

Repository work:

- Update `src/viewport/logging_config.py` to support environment-controlled formats:
  - local/dev: colored text.
  - production/observability-enabled: JSON stdout.
- Implement the chosen baseline log transport: JSON stdout plus external log shipping. Do not also enable direct OTLP log export by default, to avoid duplicates.
- Ensure log records can include request ID, trace ID, span ID, service name, environment, and version.
- Enable OpenTelemetry log correlation early enough in startup/logging configuration for trace/span fields to reach records.
- Normalize `src/viewport/logger.py` so structured events do not become JSON strings inside colored log messages in production.
- Audit and sanitize existing logs in public share, S3, background task, auth-adjacent, and presigned URL paths.
- Add request/task correlation middleware or context helpers if not already available.
- Update logging tests or add focused tests for JSON formatter redaction/correlation fields.

Human/operator work:

- Decide log retention duration and storage backend sizing.
- Decide whether raw IPs are prohibited, hashed, or retained under a documented policy.
- Configure production log collection from containers to Loki/vendor/backend.

Acceptance criteria:

- Production logging mode emits parseable JSON per line.
- Local logging remains readable.
- Logs include correlation fields when a trace/request/task context exists.
- Baseline log transport is unambiguous: stdout JSON is shipped by a log agent; OTLP log export is disabled unless a later ADR enables it.
- Existing sensitive/high-cardinality log sites have been audited and sanitized.
- Sensitive fields are redacted or omitted by policy.

### Phase 3 — OpenTelemetry traces and collector pipeline

Goal: add standard distributed tracing without coupling the app directly to a storage backend.

Repository work:

- Add OpenTelemetry dependencies to `pyproject.toml`, likely including:
  - `opentelemetry-api`
  - `opentelemetry-sdk`
  - `opentelemetry-exporter-otlp`
  - FastAPI/ASGI instrumentation
  - SQLAlchemy instrumentation
  - Redis instrumentation
  - Celery instrumentation
  - logging correlation support
  - botocore instrumentation if compatible with the S3 client stack
- Add an observability setup module, for example `src/viewport/observability.py`, to configure:
  - resource attributes: `service.name`, `service.version`, `deployment.environment`.
  - OTLP endpoint/protocol from env vars.
  - sampling defaults for local/dev.
  - FastAPI instrumentation hook.
- Integrate app instrumentation in `src/viewport/main.py` without breaking startup/lifespan behavior.
- Integrate Celery instrumentation in `src/viewport/celery_app.py` and task modules.
- Add manual spans around high-value workflows if auto-instrumentation is insufficient.
- Add tests that verify observability setup is disabled/safe when OTLP endpoint is absent or collector is unavailable.

Human/operator work:

- Choose production collector deployment topology: sidecar, host-level collector, central collector, or managed collector.
- Decide trace sampling rules and topology, especially for errors, slow uploads/downloads, public share access, and background task failures. If tail sampling is desired, operators must provide a central collector or trace-consistent routing/load-balancing design.
- Provide production OTLP endpoints, credentials if any, network policies, and TLS requirements.

Acceptance criteria:

- App and Celery can start with observability disabled or collector unreachable.
- When enabled locally, traces appear in Tempo through the collector.
- FastAPI request traces correlate with SQL/Redis/S3/Celery spans where supported.
- Collector config applies resource attributes and has a documented sampling strategy.
- Tail-sampling configs are not enabled unless the documented topology guarantees complete traces at the sampling decision point.

### Phase 4 — Local observability stack and provisioning

Goal: make the recommended stack reproducible for development/staging validation.

Repository work:

- Add `docker-compose.observability.yml` or a clearly documented Compose profile containing:
  - Prometheus.
  - Grafana.
  - OpenTelemetry Collector.
  - Loki.
  - Grafana Alloy as the concrete local log shipper from JSON stdout to Loki.
  - Tempo.
  - Alertmanager or local alert-routing placeholder.
  - Optional exporters for Postgres/Valkey/RustFS/Celery if chosen.
- Add config files under `config/observability/` for:
  - Prometheus scrape targets and alert rule loading.
  - Grafana datasource provisioning for Prometheus, Loki, and Tempo.
  - Grafana dashboard provisioning.
  - OTel Collector receivers/processors/exporters/pipelines.
  - Alertmanager example routing with placeholders only.
- Add docs commands for local startup and smoke testing.

Human/operator work:

- Map local Compose config to production deployment method.
- Replace local-only credentials and anonymous Grafana settings.
- Configure TLS, authentication, domain names, network exposure, persistent volumes, and backups.

Acceptance criteria:

- A developer can run the application plus observability stack locally with documented commands.
- Grafana opens with provisioned datasources and at least baseline dashboards.
- Prometheus successfully scrapes app metrics.
- Tempo receives traces through the collector.
- Loki receives parseable logs through the documented Grafana Alloy stdout log shipper path.

### Phase 5 — Dashboards and alerts

Goal: provide actionable operational views and symptom-first alerts.

Repository dashboard work:

- API overview dashboard:
  - request rate, error rate, p50/p95/p99 latency, in-flight requests.
  - top normalized routes by latency/error rate.
- Upload/photo pipeline dashboard:
  - pending photos, confirmations, thumbnail successes/failures, cleanup results, storage reservation/finalization/release outcomes.
- Public sharing dashboard:
  - public share success/not found/expired/password-gated outcomes.
  - download/ZIP failure counts and latency if available.
- Celery dashboard:
  - task success/failure/retry counts, runtime, queue depth/oldest queued age.
- Dependency dashboard:
  - Postgres pool/query health, Redis availability/latency, S3 errors/latency.
- System dashboard:
  - container CPU/memory/restarts if cAdvisor/node exporter or platform metrics are available.

Repository alert rule templates:

- API high error rate, e.g. 5xx ratio above threshold for 5-10 minutes.
- API high latency, e.g. p95 above agreed threshold for critical routes.
- Public share availability degradation.
- Thumbnail failures above threshold or sustained backlog/oldest job age.
- Orphan cleanup failures.
- Redis unavailable/degraded for more than a short window.
- S3 operation failures or high latency.
- Postgres connection pool saturation or query latency degradation.
- Low remaining storage/quota anomaly if measurable.
- Observability pipeline down: Prometheus target down, collector export failures, missing heartbeat metrics.

Human/operator work:

- Replace template thresholds with production SLO-based thresholds.
- Configure Alertmanager receivers, secrets, inhibition rules, grouping, escalation, and on-call ownership.
- Decide which alerts page humans immediately and which create tickets/non-urgent notifications.
- Validate alert noise during a staging burn-in period.

Acceptance criteria:

- Dashboards are provisioned from repository files.
- Alerts are version-controlled as templates with human-owned receiver placeholders.
- Each alert has a short runbook note: meaning, likely causes, first checks, escalation.

### Phase 6 — Frontend observability

Goal: add client-side visibility without violating privacy or surprising users.

Repository work:

- Add a documented frontend error/performance telemetry design before implementation.
- If approved, add Web Vitals and client error capture with strict redaction.
- Include app version/build SHA in telemetry.
- Ensure public share URLs, passwords, tokens, and user-entered values are not sent.
- Add tests for telemetry sanitization helpers.

Human/operator work:

- Decide consent requirements and privacy notice updates.
- Decide frontend telemetry backend: OTLP HTTP collector, vendor browser SDK, or no browser telemetry.
- Approve data fields collected from public unauthenticated users.

Acceptance criteria:

- Frontend telemetry is disabled by default until operator/privacy decisions are made.
- Any emitted frontend event is sanitized and documented.
- Client errors can be correlated to release/version and broad route category, not sensitive URLs.

### Phase 7 — Production rollout and operations

Goal: deploy safely with clear ownership and rollback.

Repository work:

- Add rollout checklist and runbooks to docs.
- Add smoke-test scripts or documented curl checks for `/metrics`, collector health, Grafana datasources, and sample trace/log flow where feasible.
- Add CI checks for config syntax where practical.

Human/operator work:

- Provision production observability infrastructure or managed vendor project.
- Configure DNS/TLS/auth for Grafana and any public endpoints.
- Configure persistent storage and backups for metrics/logs/traces if self-hosted.
- Configure secrets and credentials outside the repository.
- Run staging burn-in, threshold tuning, and production rollout.
- Own incident response, alert routing, and retention changes.

Acceptance criteria:

- Staging validates telemetry flow for metrics/logs/traces before production.
- Production rollout has a rollback path: disable OTel export, revert logging mode, remove scrape target, or scale down observability sidecars/services without breaking app traffic.
- Operators confirm dashboards and alert routing before alerts are paging-enabled.

## 5. Repository vs Operator Responsibility Matrix

| Area | Repository-owned work | Human/operator production-infrastructure work |
| --- | --- | --- |
| Requirements | Draft signal taxonomy, SLO candidates, runbooks, and TODOs | Approve SLOs, alert severity, escalation policy, retention, compliance posture |
| Dependencies | Add app telemetry dependencies to `pyproject.toml` after plan approval | Approve dependency/security policy and any vendor procurement |
| FastAPI metrics | Update `metrics.py`, route/workflow metrics, tests | Confirm production thresholds and critical endpoints |
| Celery metrics/traces | Instrument `celery_app.py` and tasks, task metrics/tests | Configure worker autoscaling/queue thresholds and operational response |
| DB/Redis/S3 telemetry | Add safe app-side metrics/spans around clients | Deploy/export DB/Redis/RustFS infrastructure metrics and credentials |
| Logs | Add JSON logging mode, redaction, correlation fields, tests; audit existing sensitive log sites; provide Grafana Alloy local shipper config | Configure/replace stdout log shipper storage, retention, access control, and PII policy |
| Traces | Add OTel setup, resource attrs, OTLP config, local collector template; document head-vs-tail sampling guardrails | Deploy collector topology, TLS/auth, sampling, storage, and network policy; guarantee trace-consistent routing before tail sampling |
| Compose/local stack | Add `docker-compose.observability.yml` and local configs | Decide if/how Compose maps to production; provision persistent prod storage |
| Grafana | Add datasource/dashboard provisioning templates | Secure Grafana, configure users/SSO, approve dashboards as operational source of truth |
| Alerts | Add Prometheus/Alertmanager rule templates and runbook notes | Configure receivers/secrets, tuning, paging policy, inhibition/grouping |
| Frontend telemetry | Draft and implement sanitized telemetry only after approval | Decide consent/privacy notice and browser telemetry backend |
| CI/testing | Add config syntax tests, metrics/logging/instrumentation tests; verify OTel dependency compatibility with Python 3.14 | Provide staging environment and validate real alert delivery |
| Rollout | Document rollout/rollback checklists | Execute production rollout, monitor burn-in, own incidents |

## 6. Acceptance Criteria for the Overall Implementation

An implementation based on this plan is production-ready only when all applicable criteria are met:

1. **Metrics**
   - Existing `/metrics` behavior is preserved.
   - Production `/metrics` exposure is protected by network/reverse-proxy/private-listener controls and is not publicly reachable.
   - Domain metrics cover API, upload/photo pipeline, public shares, Celery, Redis/cache, S3, and DB health where feasible.
   - Metrics avoid high-cardinality and sensitive labels.

2. **Logs**
   - Production logs are structured JSON to stdout and shipped through one documented log-ingestion path.
   - Direct OTLP log export is disabled by default unless a future ADR replaces stdout shipping.
   - Logs include correlation fields when available.
   - Sensitive fields are omitted/redacted.
   - Local development logs remain readable.

3. **Traces**
   - FastAPI and Celery emit OpenTelemetry traces through OTLP when enabled.
   - App startup remains safe if the collector is absent/unreachable.
   - Collector config includes resource attributes and documented sampling.
   - Tail sampling is only enabled with central/trace-consistent collector topology; otherwise head sampling is used.

4. **Local stack**
   - Prometheus, Grafana, OTel Collector, Tempo, Loki, and alert templates can be run locally from documented commands.
   - Grafana datasources/dashboards are provisioned from repository files.

5. **Alerts/runbooks**
   - Alert templates exist for critical symptoms and observability pipeline health.
   - Each alert has a concise operator runbook note.
   - Production receivers and thresholds are human-approved before paging.

6. **Tests/verification**
   - Metrics endpoint and custom metric behavior are tested.
   - Logging format/redaction/correlation behavior is tested.
   - Observability setup has safe-disabled/failure-mode tests.
   - Config syntax is validated where practical.

7. **Production operation**
   - Human operators have configured retention, credentials, TLS, auth, routing, dashboards, and escalation.
   - Staging burn-in has completed with threshold tuning.
   - Rollback switches are documented and tested.

## 7. Verification Matrix

| Layer | Repository verification | Expected evidence | Human/operator verification |
| --- | --- | --- | --- |
| Metrics unit/integration | Run targeted tests such as `uv run pytest tests/test_metrics.py` plus new custom metric tests. | `/metrics` returns HTTP metrics and custom Viewport metrics without duplicate registration or sensitive labels. | Confirm production scrape path is private and not internet-reachable. |
| JSON logging/redaction | Run logging formatter/redaction tests and sample app logs in production logging mode. | One JSON object per line; trace/request/task fields present when context exists; share IDs, IP/user-agent policy fields, object keys, tokens, cookies, passwords, and presigned URLs omitted/redacted. | Confirm log retention/access policy and PII handling. |
| OTel dependency spike | Run dry-run/install/import smoke checks for candidate OTel packages under Python `>=3.14,<3.15`; run app startup with observability disabled and enabled against a local collector. | Package/version report, import success/failure, app startup success, blockers listed before Phase 3. | Approve dependency/security policy and vendor/export endpoints. |
| OTel disabled/unreachable mode | Run app and Celery with OTLP unset and with a bad collector endpoint. | App/worker startup succeeds; requests/tasks continue; exporter failures do not break user traffic. | Confirm production failure-mode expectations and timeouts. |
| Local Compose stack | Run documented Compose command for app plus `docker-compose.observability.yml`. | Prometheus, Grafana, OTel Collector, Tempo, Loki, Alloy, and Alertmanager/template services start or documented optional exporters are skipped intentionally. | Map local topology to staging/production deployment. |
| Prometheus scrape | Query Prometheus targets/API after sample traffic. | App target is up; `/metrics` samples include API and domain metrics. | Tune scrape intervals and production target discovery. |
| Tempo trace smoke | Generate a sample API request that triggers DB/Redis/S3/Celery where feasible. | Trace appears in Tempo with `service.name`, route span, and related dependency/task spans or documented gaps. | Decide head/tail sampling and collector topology. |
| Loki log query | Query Loki through Grafana/LogQL after sample traffic. | JSON logs from `viewport-api` and `viewport-celery` are searchable and correlate with trace/request/task IDs. | Configure production log shipper credentials/storage/access. |
| Alert/config syntax | Run available config validation commands or container startup checks for Prometheus rules, Alertmanager config, collector config, Alloy config, and Grafana provisioning. | Configs load without syntax errors; alert rules are visible but receivers remain placeholders until human-owned config is applied. | Replace placeholders, test real alert delivery, and tune thresholds in staging. |
| End-to-end observability smoke | Execute a documented smoke flow: request API endpoint, trigger upload/thumbnail-like task in a safe test path, inspect metrics/logs/traces. | Evidence links/screenshots or command outputs for Prometheus, Grafana dashboards, Tempo trace, Loki logs, and no sensitive telemetry. | Approve staging burn-in before production paging. |

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Sensitive data leakage in labels/logs/traces | Security/privacy incident | Strict telemetry allowlist, redaction tests, no raw IDs/tokens/passwords/presigned URLs, audit existing share/S3/background-task logs carefully |
| High-cardinality metrics | Prometheus/storage instability | Use normalized routes and bounded enums; reject user/project/gallery/photo IDs as labels |
| Observability stack becomes production dependency | App outage if collector/backend fails | Non-blocking exporters, safe-disabled mode, bounded timeouts, stdout logs as fallback |
| Public `/metrics` exposure | Operational data disclosure | Restrict scrape access by private network, reverse proxy, internal listener, or platform scrape controls |
| Incorrect tail-sampling topology | Missing or inconsistent traces | Enable tail sampling only with central/trace-consistent collector routing; otherwise use head sampling |
| OTel dependency incompatibility with Python 3.14 | Failed installs or app startup failures | Run a Phase 0 dependency compatibility spike before broad instrumentation |
| Alert noise | Alert fatigue and ignored pages | Human-owned threshold tuning, staging burn-in, severity tiers, inhibition/grouping |
| Excess trace/log volume | Cost/resource pressure | Collector sampling, retention policy, log level controls, dashboard volume reviews |
| Celery trace context gaps | Harder async debugging | Add explicit task IDs, request IDs, and manual span links where auto-instrumentation is insufficient |
| RustFS/exporter uncertainty | Missing storage internals | Start with app-side S3 operation metrics; add RustFS-native metrics/exporter only after operator validation |
| Frontend privacy ambiguity | Delayed or unsafe browser telemetry | Keep frontend telemetry disabled until consent/data policy is approved |
| Config drift between local and prod | Local success does not predict production | Version local templates, document required production deltas, add staging validation checklist |

## 9. Draft ADR

### Decision

Use a vendor-neutral OpenTelemetry-centered observability design with Prometheus-compatible metrics, private production scrape access, JSON stdout logs shipped through one documented log path, OpenTelemetry trace/log correlation, and repository-provisioned local Grafana/Prometheus/Loki/Tempo/Collector templates. Keep production export compatible with either self-hosted Grafana stack or a managed observability vendor.

### Drivers

- Need correlated visibility across FastAPI, Celery, Postgres, Redis/Valkey, RustFS/S3, and frontend flows.
- Need production-safe telemetry that avoids sensitive data and cardinality explosions.
- Need incremental implementation that builds on existing `/metrics` rather than replacing it abruptly.

### Alternatives considered

- **Prometheus-only extension:** simpler, but insufficient for cross-service/background-task correlation.
- **Vendor-direct SDK:** operationally convenient, but increases lock-in and requires human procurement/privacy decisions before repository work can proceed.

### Why chosen

The recommended approach provides the best balance of standardization, local reproducibility, production flexibility, and incremental delivery. It lets repository automation implement repo-local instrumentation and templates while leaving production-specific routing, retention, secrets, and alert ownership to humans/operators.

### Consequences

- More repository configuration and dependencies will be required.
- Operators must own production deployment choices and retention/routing decisions.
- The app must treat observability backends as optional and non-blocking.
- Production deployments must explicitly protect `/metrics`; local convenience exposure is not a production security model.
- Tail sampling requires production topology support; otherwise head sampling is the safer default.
- Telemetry naming, redaction, and cardinality rules become part of the project’s engineering standards.

### Follow-ups

- Confirm production deployment target and whether observability will be self-hosted or managed.
- Confirm production `/metrics` scrape-protection mechanism.
- Complete OpenTelemetry package compatibility spike under Python 3.14.
- Confirm SLOs and alert thresholds.
- Confirm frontend telemetry/privacy policy.
- Decide whether local observability Compose services belong in the main compose file, an override file, or a separate profile.

## 10. Execution Handoff Guidance

### Suggested sequential `$ralph` path

Use one persistent executor when coordination overhead should stay low:

1. Documentation and guardrails.
2. Metrics hardening and tests.
3. JSON logging/correlation and tests.
4. OTel backend/Celery instrumentation and tests.
5. Local observability Compose/provisioning.
6. Dashboard/alert templates and runbooks.
7. Final verification and docs refresh.

### Suggested `$team` path

Use a coordinated team when parallel throughput matters after this plan is approved:

- `executor` lane A: backend metrics and tests.
- `executor` lane B: logging/correlation and redaction tests.
- `executor` lane C: OpenTelemetry setup for FastAPI/Celery.
- `executor` or `devops-config` equivalent lane D: Compose, collector, Prometheus, Grafana, Loki, Tempo templates.
- `test-engineer` lane: test strategy, metric/logging/config validation.
- `security-reviewer` lane: telemetry privacy, redaction, cardinality, public-share/password safety.
- `writer` lane: runbooks, rollout/rollback, operator TODOs.
- `verifier` lane: final evidence review against acceptance criteria.

Suggested reasoning levels:

- High: OTel design, security/privacy review, final verification.
- Medium: metrics/logging implementation, Compose/provisioning, tests.
- Low/medium: dashboard JSON/template iteration after naming is settled.

Team verification path:

1. Run backend tests for metrics/logging/observability setup.
2. Run lint/typecheck after dependency and code changes.
3. Start local app plus observability stack.
4. Generate sample API traffic and a sample Celery task.
5. Verify Prometheus scrape, Grafana datasources, Tempo traces, Loki logs, and alert rule loading.
6. Confirm no sensitive values appear in telemetry samples.
7. Complete rollout checklist with human-owned production items still marked as operator TODOs.
