from viewport.filename_utils import build_content_disposition


def test_build_content_disposition_escapes_quotes_and_backslashes():
    assert build_content_disposition('client "pick" \\ final.jpg') == 'inline; filename="client \\"pick\\" \\\\ final.jpg"'
    assert build_content_disposition("download.zip", disposition_type="attachment") == 'attachment; filename="download.zip"'
