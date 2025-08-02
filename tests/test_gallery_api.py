"""Tests for gallery API endpoints."""

from uuid import uuid4

from fastapi.testclient import TestClient

from tests.helpers import register_and_login


class TestGalleryAPI:
    """Test gallery API endpoints with comprehensive coverage."""

    def test_create_gallery_success(self, authenticated_client: TestClient):
        """Test successful gallery creation."""
        response = authenticated_client.post("/galleries/", json={})
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "owner_id" in data
        assert "created_at" in data
        # Verify the ID is a valid UUID format
        import uuid

        uuid.UUID(data["id"])  # Should not raise exception

    def test_create_gallery_unauthorized(self, client: TestClient):
        """Test gallery creation without authentication."""
        response = client.post("/galleries/", json={})
        assert response.status_code == 401

    def test_create_gallery_invalid_token(self, client: TestClient):
        """Test gallery creation with invalid token."""
        client.headers.update({"Authorization": "Bearer invalid_token"})
        response = client.post("/galleries/", json={})
        assert response.status_code == 401

    def test_list_galleries_empty(self, authenticated_client: TestClient):
        """Test listing galleries when user has no galleries."""
        response = authenticated_client.get("/galleries/")
        assert response.status_code == 200
        data = response.json()
        assert data["galleries"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["size"] == 10

    def test_list_galleries_with_galleries(self, authenticated_client: TestClient):
        """Test listing galleries when user has galleries."""
        # Create several galleries
        gallery_ids = []
        for _ in range(3):
            response = authenticated_client.post("/galleries/", json={})
            assert response.status_code == 201
            gallery_ids.append(response.json()["id"])

        # List galleries
        response = authenticated_client.get("/galleries/")
        assert response.status_code == 200
        data = response.json()
        assert len(data["galleries"]) == 3
        assert data["total"] == 3
        assert data["page"] == 1
        assert data["size"] == 10

        # Verify all created galleries are in the response
        returned_ids = [g["id"] for g in data["galleries"]]
        for gallery_id in gallery_ids:
            assert gallery_id in returned_ids

    def test_list_galleries_pagination(self, authenticated_client: TestClient):
        """Test gallery listing with pagination."""
        # Create 5 galleries
        for _ in range(5):
            response = authenticated_client.post("/galleries/", json={})
            assert response.status_code == 201

        # Test first page with size 2
        response = authenticated_client.get("/galleries/?page=1&size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["galleries"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        assert data["size"] == 2

        # Test second page
        response = authenticated_client.get("/galleries/?page=2&size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["galleries"]) == 2
        assert data["page"] == 2
        assert data["size"] == 2

        # Test third page (should have 1 gallery)
        response = authenticated_client.get("/galleries/?page=3&size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["galleries"]) == 1
        assert data["page"] == 3

    def test_list_galleries_invalid_pagination(self, authenticated_client: TestClient):
        """Test gallery listing with invalid pagination parameters."""
        # Invalid page (less than 1)
        response = authenticated_client.get("/galleries/?page=0")
        assert response.status_code == 422

        # Invalid size (greater than 100)
        response = authenticated_client.get("/galleries/?size=101")
        assert response.status_code == 422

        # Invalid size (less than 1)
        response = authenticated_client.get("/galleries/?size=0")
        assert response.status_code == 422

    def test_list_galleries_unauthorized(self, client: TestClient):
        """Test listing galleries without authentication."""
        response = client.get("/galleries/")
        assert response.status_code == 401

    def test_get_gallery_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful gallery retrieval."""
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == gallery_id_fixture
        assert "owner_id" in data
        assert "created_at" in data
        assert "photos" in data
        assert "share_links" in data
        assert isinstance(data["photos"], list)
        assert isinstance(data["share_links"], list)

    def test_get_gallery_not_found(self, authenticated_client: TestClient):
        """Test retrieving non-existent gallery."""
        fake_uuid = str(uuid4())
        response = authenticated_client.get(f"/galleries/{fake_uuid}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_gallery_invalid_uuid(self, authenticated_client: TestClient):
        """Test retrieving gallery with invalid UUID format."""
        response = authenticated_client.get("/galleries/invalid-uuid")
        assert response.status_code == 400
        assert "invalid gallery id format" in response.json()["detail"].lower()

    def test_get_gallery_unauthorized(self, client: TestClient):
        """Test retrieving gallery without authentication."""
        fake_gallery_id = str(uuid4())
        response = client.get(f"/galleries/{fake_gallery_id}")
        assert response.status_code == 401

    def test_get_gallery_different_user(self, client: TestClient, gallery_id_fixture: str):
        """Test retrieving gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        response = client.get(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_gallery_success(self, authenticated_client: TestClient, gallery_id_fixture: str):
        """Test successful gallery deletion."""
        response = authenticated_client.delete(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 204

        # Verify gallery is deleted
        response = authenticated_client.get(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 404

    def test_delete_gallery_not_found(self, authenticated_client: TestClient):
        """Test deleting non-existent gallery."""
        fake_uuid = str(uuid4())
        response = authenticated_client.delete(f"/galleries/{fake_uuid}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_gallery_invalid_uuid(self, authenticated_client: TestClient):
        """Test deleting gallery with invalid UUID format."""
        response = authenticated_client.delete("/galleries/invalid-uuid")
        assert response.status_code == 422
        assert "invalid gallery id format" in response.json()["detail"].lower()

    def test_delete_gallery_unauthorized(self, client: TestClient):
        """Test deleting gallery without authentication."""
        fake_gallery_id = str(uuid4())
        response = client.delete(f"/galleries/{fake_gallery_id}")
        assert response.status_code == 401

    def test_delete_gallery_different_user(self, client: TestClient, gallery_id_fixture: str):
        """Test deleting gallery owned by different user."""
        # Create and authenticate as different user
        different_user_token = register_and_login(client, "different@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {different_user_token}"})

        response = client.delete(f"/galleries/{gallery_id_fixture}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_gallery_isolation_between_users(self, client: TestClient):
        """Test that users can only see their own galleries."""
        # Create first user and gallery
        user1_token = register_and_login(client, "user1@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user1_token}"})

        resp1 = client.post("/galleries/", json={})
        assert resp1.status_code == 201
        gallery1_id = resp1.json()["id"]

        # Create second user and gallery
        user2_token = register_and_login(client, "user2@example.com", "password123")
        client.headers.update({"Authorization": f"Bearer {user2_token}"})

        resp2 = client.post("/galleries/", json={})
        assert resp2.status_code == 201
        gallery2_id = resp2.json()["id"]

        # User 2 should only see their gallery
        resp = client.get("/galleries/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["galleries"]) == 1
        assert data["galleries"][0]["id"] == gallery2_id

        # User 2 should not be able to access user 1's gallery
        resp = client.get(f"/galleries/{gallery1_id}")
        assert resp.status_code == 404

        # Switch back to user 1
        client.headers.update({"Authorization": f"Bearer {user1_token}"})

        # User 1 should only see their gallery
        resp = client.get("/galleries/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["galleries"]) == 1
        assert data["galleries"][0]["id"] == gallery1_id

        # User 1 should not be able to access user 2's gallery
        resp = client.get(f"/galleries/{gallery2_id}")
        assert resp.status_code == 404
