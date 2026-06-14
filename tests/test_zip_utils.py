"""Tests for viewport.zip_utils — primarily make_content_disposition_header."""

import pytest

from viewport.zip_utils import make_content_disposition_header


class TestMakeContentDispositionHeader:
    """Test that make_content_disposition_header always produces latin-1 safe output."""

    # ── helper ──────────────────────────────────────────────────────────────

    @staticmethod
    def _assert_latin1_safe(header: str) -> None:
        """Verify a header value can be encoded as latin-1 without error."""
        try:
            header.encode("latin-1")
        except UnicodeEncodeError as exc:
            pytest.fail(f"Header not latin-1 safe: {header!r} → {exc}")

    # ── pure ASCII ─────────────────────────────────────────────────────────

    def test_pure_ascii_uses_simple_filename(self):
        header = make_content_disposition_header("my_gallery.zip")
        assert header == 'attachment; filename="my_gallery.zip"'
        self._assert_latin1_safe(header)

    def test_ascii_with_spaces(self):
        header = make_content_disposition_header("my gallery.zip")
        assert header == 'attachment; filename="my gallery.zip"'
        self._assert_latin1_safe(header)

    def test_ascii_with_punctuation(self):
        header = make_content_disposition_header("photo_(1).zip")
        assert header == 'attachment; filename="photo_(1).zip"'
        self._assert_latin1_safe(header)

    # ── non-ASCII: RFC 5987 fallback path ───────────────────────────────────

    def test_cyrillic_falls_back_to_rfc5987(self):
        header = make_content_disposition_header("Галерея.zip")
        assert 'filename*=' in header, f"Expected RFC 5987 (filename*=), got {header}"
        assert 'UTF-8' in header, f"Expected UTF-8, got {header}"
        self._assert_latin1_safe(header)

    def test_accented_latin1_but_not_ascii(self):
        """Characters like 'í' are latin-1 compatible but not ASCII."""
        header = make_content_disposition_header("Galería.zip")
        assert 'filename*=' in header, f"Expected RFC 5987 for non-ASCII, got {header}"
        assert "Galeria.zip" in header  # NFKD strips accent
        self._assert_latin1_safe(header)

    def test_pure_cjk_falls_back_to_download(self):
        """CJK chars have no ASCII equivalent → fallback to 'download'."""
        header = make_content_disposition_header("フォト.zip")
        assert 'filename*=' in header
        assert 'filename="download"' in header, f"Expected download fallback, got {header}"
        self._assert_latin1_safe(header)

    def test_german_umlaut(self):
        header = make_content_disposition_header("München.zip")
        assert 'filename*=' in header
        assert "Muenchen.zip" in header or "Munchen.zip" in header  # NFKD → ue or u
        self._assert_latin1_safe(header)

    def test_french_accents(self):
        header = make_content_disposition_header("Noël_élève.zip")
        assert 'filename*=' in header
        self._assert_latin1_safe(header)

    def test_mixed_ascii_and_cyrillic(self):
        header = make_content_disposition_header("2024-Галерея.zip")
        assert 'filename*=' in header
        # NFKD keeps ASCII parts
        assert 'filename="2024-' in header
        self._assert_latin1_safe(header)

    def test_emoji(self):
        header = make_content_disposition_header("😀.zip")
        assert 'filename*=' in header
        assert 'filename="download"' in header  # emoji → no ASCII left
        self._assert_latin1_safe(header)

    # ── edge cases ──────────────────────────────────────────────────────────

    def test_empty_string_safe(self):
        """Empty string is ASCII, so it takes the simple path — just verify no crash."""
        header = make_content_disposition_header("")
        self._assert_latin1_safe(header)

    @pytest.mark.parametrize(
        "filename,expected_fallback",
        [
            ("...zip", "download"),  # starts with dot after normalize
            (".zip", "download"),
            ("..zip", "download"),
        ],
    )
    def test_dot_only_filename_falls_back(self, filename, expected_fallback):
        # These are pure ASCII so they take the simple path — verify
        header = make_content_disposition_header(filename)
        self._assert_latin1_safe(header)
        # ASCII path: no filename*=; just plain filename=
        assert 'filename="' in header

    @pytest.mark.parametrize(
        "filename",
        [
            "a" * 100 + ".zip",  # long ASCII
            "Галерея " * 50 + ".zip",  # long Cyrillic
        ],
    )
    def test_very_long_filename(self, filename):
        header = make_content_disposition_header(filename)
        self._assert_latin1_safe(header)

    # ── regression: production crash ────────────────────────────────────────

    def test_regression_non_ascii_gallery_name(self):
        """Simulate the exact production scenario: a Cyrillic gallery name
        passed through sanitize_zip_entry_name and used in Content-Disposition."""
        from viewport.zip_utils import sanitize_zip_entry_name

        # This is what happens on line 619 of public.py
        gallery_name = "Свадьба"  # Cyrillic gallery name
        safe = sanitize_zip_entry_name(gallery_name, fallback=f"gallery_default")
        filename = f"{safe}.zip"

        # The fix ensures this never throws
        header = make_content_disposition_header(filename)
        self._assert_latin1_safe(header)
        assert 'filename*=' in header

    def test_regression_chinese_gallery_name(self):
        from viewport.zip_utils import sanitize_zip_entry_name

        gallery_name = "婚礼照片"  # Chinese
        safe = sanitize_zip_entry_name(gallery_name, fallback=f"gallery_default")
        filename = f"{safe}.zip"

        header = make_content_disposition_header(filename)
        self._assert_latin1_safe(header)
        assert "filename*=UTF-8" in header
        assert 'filename="download"' in header  # no ASCII chars left
