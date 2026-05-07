from fastapi import FastAPI

from viewport.observability import ObservabilitySettings, build_resource_attributes, configure_observability


def test_build_resource_attributes_uses_service_identity():
    settings = ObservabilitySettings(
        OTEL_ENABLED=False,
        OTEL_SERVICE_NAME="viewport-api",
        SERVICE_VERSION="1.2.3",
        DEPLOYMENT_ENVIRONMENT="staging",
    )

    assert build_resource_attributes(settings) == {
        "service.name": "viewport-api",
        "service.version": "1.2.3",
        "deployment.environment": "staging",
    }
    assert build_resource_attributes(settings, service_name="viewport-celery")["service.name"] == "viewport-celery"


def test_configure_observability_disabled_is_safe():
    app = FastAPI()
    settings = ObservabilitySettings(OTEL_ENABLED=False)

    assert configure_observability(app, settings=settings) is False
    assert not getattr(app.state, "viewport_otel_instrumented", False)


def test_configure_observability_enabled_without_endpoint_is_non_fatal(monkeypatch):
    import viewport.observability as observability

    monkeypatch.setattr(observability, "_CONFIGURED", False)
    app = FastAPI()
    settings = ObservabilitySettings(
        OTEL_ENABLED=True,
        OTEL_TRACES_EXPORTER="console",
        OTEL_SERVICE_NAME="viewport-api",
        OTEL_INSTRUMENT_SQLALCHEMY=False,
        OTEL_INSTRUMENT_REDIS=False,
        OTEL_INSTRUMENT_CELERY=False,
        OTEL_INSTRUMENT_BOTOCORE=False,
    )

    assert configure_observability(app, settings=settings) is True
    assert app.state.viewport_otel_instrumented is True
