"""Shared orientation and delivery rules; no database or image decoding here."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from viewport.models.gallery import Photo

ROTATION_PENDING_STATUSES = ("pending", "processing")
# Compose a clockwise screen-space turn with every EXIF orientation, including mirrors.
EXIF_CLOCKWISE = {1: 6, 6: 3, 3: 8, 8: 1, 2: 7, 7: 4, 4: 5, 5: 2}


def compose_exif_rotation(orientation: int, rotation: int) -> int:
    if orientation not in EXIF_CLOCKWISE or rotation not in (0, 90, 180, 270):
        raise ValueError("Invalid image orientation")
    for _ in range(rotation // 90):
        orientation = EXIF_CLOCKWISE[orientation]
    return orientation


def rotate_focal_point(x: float, y: float, angle: int) -> tuple[float, float]:
    for _ in range((angle % 360) // 90):
        x, y = 100 - y, x
    return x, y


def get_photo_delivery_key(photo: "Photo") -> str:
    return getattr(photo, "rotated_object_key", None) or photo.object_key


def is_rotation_pending(photo: "Photo") -> bool:
    return getattr(photo, "rotation_status", "ready") in ROTATION_PENDING_STATUSES
