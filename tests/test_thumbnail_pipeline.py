import errno
import io
from pathlib import Path

import pytest
from PIL import Image

from viewport import background_tasks
from viewport.background_tasks import ThumbnailScratchError, _is_valid_image, _stream_s3_object_to_tempfile
from viewport.s3_utils import _get_pyvips, create_thumbnail_from_path


class _StreamingBody(io.BytesIO):
    def __init__(self, content: bytes) -> None:
        super().__init__(content)
        self.read_sizes: list[int] = []

    def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        return super().read(size)


class _S3Client:
    def __init__(self, body: _StreamingBody) -> None:
        self.body = body

    def get_object(self, **_kwargs):
        return {"Body": self.body}


def _require_libvips() -> None:
    try:
        _get_pyvips()
    except (ImportError, OSError) as error:
        pytest.skip(f"libvips runtime is not installed: {error}")


def test_s3_original_is_copied_in_bounded_chunks() -> None:
    content = b"x" * (2 * 1024 * 1024 + 17)
    body = _StreamingBody(content)

    with _stream_s3_object_to_tempfile(_S3Client(body), "bucket", "photo.jpg") as path:
        assert Path(path).read_bytes() == content

    assert body.closed
    assert body.read_sizes
    assert all(0 < size <= 1024 * 1024 for size in body.read_sizes)


def test_s3_body_is_closed_and_scratch_error_is_retryable_when_tempfile_is_full(monkeypatch) -> None:
    body = _StreamingBody(b"original")

    def fail_tempfile():
        raise OSError(errno.ENOSPC, "no space left on device")

    monkeypatch.setattr(background_tasks.tempfile, "TemporaryFile", fail_tempfile)

    with pytest.raises(ThumbnailScratchError), _stream_s3_object_to_tempfile(_S3Client(body), "bucket", "photo.jpg"):
        pytest.fail("scratch path must not be yielded")

    assert body.closed


def test_image_validation_treats_local_path_errno_as_scratch_failure(monkeypatch) -> None:
    monkeypatch.setattr(background_tasks.Image, "open", lambda _path: (_ for _ in ()).throw(OSError(errno.EIO, "I/O error")))

    with pytest.raises(ThumbnailScratchError):
        _is_valid_image("/proc/self/fd/123")


@pytest.mark.parametrize(
    ("mode", "image_format", "size", "expected_size"),
    [
        ("CMYK", "JPEG", (1600, 800), (1000, 500)),
        ("RGBA", "PNG", (800, 1600), (500, 1000)),
    ],
)
def test_path_thumbnail_supports_photo_modes_and_bounding_box(
    tmp_path: Path,
    mode: str,
    image_format: str,
    size: tuple[int, int],
    expected_size: tuple[int, int],
) -> None:
    _require_libvips()
    image_path = tmp_path / f"input.{image_format.lower()}"
    Image.new(mode, size, 128 if mode == "CMYK" else (255, 0, 0, 96)).save(image_path, format=image_format)

    thumbnail, width, height = create_thumbnail_from_path(image_path)

    assert (width, height) == expected_size
    with Image.open(io.BytesIO(thumbnail)) as output:
        assert output.format == "AVIF"
        assert output.mode == "RGB"
        assert output.size == expected_size
        if mode == "RGBA":
            red, green, blue = output.convert("RGB").getpixel((output.width // 2, output.height // 2))
            assert red > 200
            assert green < 60
            assert blue < 60
        output.verify()


def test_path_thumbnail_applies_exif_orientation(tmp_path: Path) -> None:
    _require_libvips()
    image_path = tmp_path / "oriented.jpg"
    exif = Image.Exif()
    exif[274] = 6
    Image.new("RGB", (1200, 600), "blue").save(image_path, exif=exif)

    thumbnail, width, height = create_thumbnail_from_path(image_path)

    assert (width, height) == (500, 1000)
    with Image.open(io.BytesIO(thumbnail)) as output:
        assert output.size == (500, 1000)
