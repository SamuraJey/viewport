import pytest
from fastapi.testclient import TestClient

from src.viewport.main import app


@pytest.fixture(scope="function")
def client():
    return TestClient(app)


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
