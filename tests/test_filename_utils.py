from types import SimpleNamespace

from viewport.filename_utils import build_content_disposition, resolve_photo_filename


def test_build_content_disposition_escapes_quotes_and_backslashes():
    assert build_content_disposition('client "pick" \\ final.jpg') == 'inline; filename="client \\"pick\\" \\\\ final.jpg"'
    assert build_content_disposition("download.zip", disposition_type="attachment") == 'attachment; filename="download.zip"'


def test_resolve_photo_filename_prefers_display_name():
    photo = SimpleNamespace(display_name="client-pick.jpg", object_key="gallery/original.jpg")

    assert resolve_photo_filename(photo) == "client-pick.jpg"


def test_resolve_photo_filename_falls_back_to_object_key_leaf():
    photo = SimpleNamespace(display_name="", object_key="gallery/original.jpg")

    assert resolve_photo_filename(photo) == "original.jpg"
