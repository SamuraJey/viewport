from datetime import UTC, datetime, timedelta


class TestShareLinkAPI:
    def test_create_sharelink_success(self, authenticated_client, gallery_id_fixture):
        expires = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        payload = {"gallery_id": gallery_id_fixture, "expires_at": expires}
        resp = authenticated_client.post(f"/galleries/{gallery_id_fixture}/share-links", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["gallery_id"] == gallery_id_fixture
        assert data["expires_at"] == expires or data["expires_at"] is not None
        assert data["views"] == 0
        assert data["zip_downloads"] == 0
        assert data["single_downloads"] == 0

    def test_create_sharelink_wrong_gallery(self, authenticated_client):
        fake_gallery_id = "00000000-0000-0000-0000-000000000000"
        payload = {"gallery_id": fake_gallery_id, "expires_at": None}
        resp = authenticated_client.post(f"/galleries/{fake_gallery_id}/share-links", json=payload)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Gallery not found"
