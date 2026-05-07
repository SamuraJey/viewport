# Observability Dependency Compatibility Report

Date: 2026-05-07
Runtime target: Python `>=3.14,<3.15`
Scope: OpenTelemetry packages required by `docs/observability-monitoring.md` and `docs/observability-monitoring-plan.md`.

## Resolver check

Command used:

```bash
uv pip install --dry-run --python-version 3.14 \
  opentelemetry-api \
  opentelemetry-sdk \
  opentelemetry-exporter-otlp \
  opentelemetry-instrumentation-fastapi \
  opentelemetry-instrumentation-asgi \
  opentelemetry-instrumentation-sqlalchemy \
  opentelemetry-instrumentation-redis \
  opentelemetry-instrumentation-celery \
  opentelemetry-instrumentation-logging \
  opentelemetry-instrumentation-botocore
```

Result: resolver succeeded for Python 3.14.

Resolved direct/observability packages:

- `opentelemetry-api==1.41.1`
- `opentelemetry-sdk==1.41.1`
- `opentelemetry-exporter-otlp==1.41.1`
- `opentelemetry-exporter-otlp-proto-common==1.41.1`
- `opentelemetry-exporter-otlp-proto-grpc==1.41.1`
- `opentelemetry-exporter-otlp-proto-http==1.41.1`
- `opentelemetry-instrumentation==0.62b1`
- `opentelemetry-instrumentation-asgi==0.62b1`
- `opentelemetry-instrumentation-botocore==0.62b1`
- `opentelemetry-instrumentation-celery==0.62b1`
- `opentelemetry-instrumentation-fastapi==0.62b1`
- `opentelemetry-instrumentation-logging==0.62b1`
- `opentelemetry-instrumentation-redis==0.62b1`
- `opentelemetry-instrumentation-sqlalchemy==0.62b1`
- `opentelemetry-semantic-conventions==0.62b1`
- `opentelemetry-util-http==0.62b1`

## Import/startup smoke

Command used:

```bash
uv run python - <<'PY'
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
from fastapi import FastAPI
from viewport.observability import ObservabilitySettings, configure_observability
app = FastAPI()
settings = ObservabilitySettings(
    OTEL_ENABLED=True,
    OTEL_TRACES_EXPORTER='console',
    OTEL_INSTRUMENT_SQLALCHEMY=False,
    OTEL_INSTRUMENT_REDIS=False,
    OTEL_INSTRUMENT_BOTOCORE=False,
)
print('CONFIGURE OK:', configure_observability(app, settings=settings))
PY
```

Result: all imports succeeded and `configure_observability()` returned `True` with console export and dependency auto-instrumentation disabled for the smoke.

## Decision

The Phase 0 dependency gate is clear for repository implementation. The app still keeps OpenTelemetry safe-disabled by default and non-fatal when enabled because production collector topology, TLS/auth, sampling, and retention remain operator-owned.
