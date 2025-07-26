class TestGalleryAPI:
    def test_create_gallery(self, authenticated_client):
        resp = authenticated_client.post("/galleries", json={})
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert "owner_id" in data
        assert "created_at" in data

    def test_create_gallery_unauth(self, client):
        resp = client.post("/galleries", json={})
        assert resp.status_code == 403 or resp.status_code == 401

    def test_list_galleries(self, authenticated_client):
        # Create 3 galleries
        for _ in range(3):
            authenticated_client.post("/galleries", json={})
        resp = authenticated_client.get("/galleries")
        assert resp.status_code == 200
        data = resp.json()
        assert "galleries" in data
        assert data["total"] == 3
        assert len(data["galleries"]) == 3

    def test_list_galleries_pagination(self, authenticated_client):
        for _ in range(15):
            authenticated_client.post("/galleries", json={})
        resp = authenticated_client.get("/galleries?page=2&size=10")
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 2
        assert data["size"] == 10
        assert len(data["galleries"]) == 5

    def test_list_galleries_unauth(self, client):
        resp = client.get("/galleries")
        assert resp.status_code == 403 or resp.status_code == 401
