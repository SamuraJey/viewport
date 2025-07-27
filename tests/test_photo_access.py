import io


def test_photo_access_authenticated_user(client, auth_headers, gallery_id_fixture):
    """Test that authenticated users can access photos in their own galleries"""
    # Upload a text file to S3
    file_content = b"dummy data"
    files = {"file": ("testfile.txt", io.BytesIO(file_content), "text/plain")}
    resp = client.post(f"/galleries/{gallery_id_fixture}/photos", files=files, headers=auth_headers)
    assert resp.status_code == 201

    # Get the photo ID from the response
    photo_data = resp.json()
    photo_id = photo_data["id"]

    # Access the photo via the secure authenticated endpoint
    photo_resp = client.get(f"/galleries/{gallery_id_fixture}/photos/{photo_id}", headers=auth_headers)
    assert photo_resp.status_code == 200
    assert photo_resp.content == file_content
    assert photo_resp.headers["content-type"].startswith("text/plain")


def test_photo_access_unauthorized(client, gallery_id_fixture):
    """Test that unauthenticated users cannot access photos directly"""
    # Try to access a photo without authentication
    fake_photo_id = "123e4567-e89b-12d3-a456-426614174000"
    resp = client.get(f"/galleries/{gallery_id_fixture}/photos/{fake_photo_id}")
    assert resp.status_code == 403  # Should require authentication


def test_photo_access_wrong_gallery(client, auth_headers):
    """Test that users cannot access photos from galleries they don't own"""
    fake_gallery_id = "123e4567-e89b-12d3-a456-426614174000"
    fake_photo_id = "987e6543-e21b-12d3-a456-426614174000"
    resp = client.get(f"/galleries/{fake_gallery_id}/photos/{fake_photo_id}", headers=auth_headers)
    assert resp.status_code == 404  # Should not find the photo
