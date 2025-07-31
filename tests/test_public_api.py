class TestPublicAPI:
    def test_get_photos_by_sharelink_not_found(self, client):
        # Try to access a non-existent sharelink
        fake_uuid = "12345678-1234-1234-1234-123456789012"
        resp = client.get(f"/s/{fake_uuid}")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
