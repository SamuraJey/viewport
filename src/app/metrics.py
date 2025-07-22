from prometheus_fastapi_instrumentator import Instrumentator


def setup_metrics(app):
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")
