from fastapi import FastAPI
from prometheus_client import generate_latest

from viewport.metrics import record_celery_task_event, record_presigned_cache_event, record_public_share_event, record_redis_operation, record_s3_operation, record_upload_event, setup_metrics


class TestMetrics:
    def test_metrics_endpoint_exists(self, client):
        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert "http_requests_total" in resp.text

    def test_metrics_content(self, client):
        # Structure only: check some expected metrics
        resp = client.get("/metrics")
        assert "http_requests_total" in resp.text
        assert "http_request_duration_seconds" in resp.text


class TestViewportDomainMetrics:
    def test_setup_metrics_is_idempotent_for_same_app(self):
        app = FastAPI()
        setup_metrics(app)
        setup_metrics(app)
        metric_routes = [route for route in app.routes if getattr(route, "path", None) == "/metrics"]
        assert len(metric_routes) == 1

    def test_custom_metrics_use_bounded_labels(self):
        record_upload_event("batch_presigned", "success")
        record_public_share_event("access", "expired")
        record_s3_operation("presign_get", "cache_hit", 0.01)
        record_redis_operation("get", "hit", 0.001)
        record_presigned_cache_event("batch_get", "miss")
        record_celery_task_event("viewport.background_tasks.create_thumbnails_batch", "succeeded")

        rendered = generate_latest().decode()

        assert 'viewport_upload_events_total{operation="batch_presigned",outcome="success"}' in rendered
        assert 'viewport_public_share_events_total{event="access",outcome="expired"}' in rendered
        assert 'viewport_s3_operations_total{operation="presign_get",outcome="cache_hit"}' in rendered
        assert 'viewport_redis_operations_total{operation="get",outcome="hit"}' in rendered
        assert 'viewport_presigned_cache_events_total{operation="batch_get",outcome="miss"}' in rendered
        assert 'viewport_celery_task_events_total{state="succeeded",task_name="create_thumbnails_batch"}' in rendered

    def test_unknown_metric_labels_collapse_to_other(self):
        forbidden_uuid = "11111111-1111-1111-1111-111111111111"
        record_public_share_event(forbidden_uuid, "unexpected-status")

        rendered = generate_latest().decode()

        assert forbidden_uuid not in rendered
        assert 'viewport_public_share_events_total{event="other",outcome="other"}' in rendered
