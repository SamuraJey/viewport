import io
from tests.conftest import auth_headers, gallery_id_fixture


def test_proxy_file_success(client, auth_headers, gallery_id_fixture):
    # Upload a text file to S3
    file_content = b"dummy data"
    files = {"file": ("testfile.txt", io.BytesIO(file_content), "text/plain")}
    resp = client.post(f"/galleries/{gallery_id_fixture}/photos", files=files, headers=auth_headers)
    assert resp.status_code == 201
    # Object key constructed by upload endpoint
    key = f"{gallery_id_fixture}/testfile.txt"
    # Proxy the file via backend
    proxy_resp = client.get(f"/files/{key}")
    assert proxy_resp.status_code == 200
    assert proxy_resp.content == file_content
    assert proxy_resp.headers["content-type"].startswith("text/plain")


def test_proxy_file_not_found(client):
    # Request a non-existent key
    resp = client.get("/files/nonexistent.txt")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "File not found"
