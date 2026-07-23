from uuid import uuid4

from fastapi.testclient import TestClient


def test_reorder_projects_persists_manual_order_and_rejects_unowned_ids(
    authenticated_client: TestClient,
):
    project_ids = [authenticated_client.post("/projects", json={"name": name}).json()["id"] for name in ("One", "Two", "Three")]

    initial_resp = authenticated_client.get("/projects?page=1&size=20&sort_by=manual_order&order=asc")
    assert initial_resp.status_code == 200
    initial_ids = [project["id"] for project in initial_resp.json()["projects"] if project["id"] in project_ids]
    desired_ids = list(reversed(initial_ids))

    reorder_resp = authenticated_client.patch(
        "/projects/reorder",
        json={"project_ids": desired_ids},
    )
    assert reorder_resp.status_code == 204

    reordered_resp = authenticated_client.get("/projects?page=1&size=20&sort_by=manual_order&order=asc")
    assert reordered_resp.status_code == 200
    reordered_projects = [project for project in reordered_resp.json()["projects"] if project["id"] in project_ids]
    assert [project["id"] for project in reordered_projects] == desired_ids
    assert [project["manual_order"] for project in reordered_projects] == sorted(project["manual_order"] for project in reordered_projects)

    rejected_resp = authenticated_client.patch(
        "/projects/reorder",
        json={"project_ids": [str(uuid4())]},
    )
    assert rejected_resp.status_code == 400

    unchanged_resp = authenticated_client.get("/projects?page=1&size=20&sort_by=manual_order&order=asc")
    unchanged_ids = [project["id"] for project in unchanged_resp.json()["projects"] if project["id"] in project_ids]
    assert unchanged_ids == desired_ids
