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
        assert "viewport_db_connections_checked_out" in resp.text
        assert "viewport_db_connection_checkout_duration_seconds" in resp.text
        assert "viewport_auth_rate_limit_decisions_total" in resp.text
        assert "viewport_auth_refresh_rotations_total" in resp.text
        assert "viewport_auth_refresh_rejects_total" in resp.text
        assert "viewport_auth_refresh_families_revoked_total" in resp.text
