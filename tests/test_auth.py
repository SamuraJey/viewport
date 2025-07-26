class TestAuthAPI:
    def test_register_success(self, client):
        payload = {"email": "pytestuser@example.com", "password": "pytestpassword123"}
        response = client.post("/auth/register", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == payload["email"]
        assert "id" in data

    def test_register_duplicate(self, client):
        payload = {"email": "pytestdupe@example.com", "password": "pytestpassword123"}
        # First registration should succeed
        response1 = client.post("/auth/register", json=payload)
        assert response1.status_code == 201
        # Second registration should fail
        response2 = client.post("/auth/register", json=payload)
        assert response2.status_code == 400
        assert response2.json()["detail"] == "Email already registered"

    def test_login_success(self, client):
        reg_payload = {"email": "loginuser@example.com", "password": "loginpassword123"}
        client.post("/auth/register", json=reg_payload)
        login_payload = {"email": "loginuser@example.com", "password": "loginpassword123"}
        response = client.post("/auth/login", json=login_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == login_payload["email"]
        assert "id" in data

    def test_login_wrong_password(self, client):
        reg_payload = {"email": "wrongpass@example.com", "password": "rightpassword123"}
        client.post("/auth/register", json=reg_payload)
        login_payload = {"email": "wrongpass@example.com", "password": "wrongpassword123"}
        response = client.post("/auth/login", json=login_payload)
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid email or password"

    def test_login_user_not_found(self, client):
        login_payload = {"email": "notfound@example.com", "password": "anypassword123"}
        response = client.post("/auth/login", json=login_payload)
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid email or password"

    def test_me_valid_token(self, client):
        reg_payload = {"email": "meuser@example.com", "password": "mepassword123"}
        reg_resp = client.post("/auth/register", json=reg_payload)
        login_resp = client.post("/auth/login", json=reg_payload)
        token = login_resp.json()["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        me_resp = client.get("/me", headers=headers)
        assert me_resp.status_code == 200
        data = me_resp.json()
        assert data["email"] == reg_payload["email"]

    def test_me_missing_token(self, client):
        resp = client.get("/me")
        assert resp.status_code == 403 or resp.status_code == 401

    def test_me_invalid_token(self, client):
        headers = {"Authorization": "Bearer invalidtoken"}
        resp = client.get("/me", headers=headers)
        assert resp.status_code == 401
