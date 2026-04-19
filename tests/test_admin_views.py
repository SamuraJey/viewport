from viewport.admin.views import ProjectAdmin


def test_project_admin_disables_delete_to_preserve_gallery_project_invariant() -> None:
    assert ProjectAdmin.can_delete is False
