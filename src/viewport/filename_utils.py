import re
from pathlib import Path


def sanitize_filename(filename: str) -> str:
    """Sanitize filename while preserving readability and Cyrillic characters.

    Removes path separators and null bytes,
    keeps alphanumeric (Latin + Cyrillic), spaces, dots, dashes, underscores, and parentheses.
    """
    if not filename:
        return "file"

    filename = filename.replace("\\", "").replace("/", "").replace("\0", "")
    filename = re.sub(r"[^a-zA-Z0-9._\-() а-яА-ЯёЁ]", "", filename)
    filename = filename.strip(" .-")

    if not filename:
        filename = "file"

    return filename


def split_name_and_ext(filename: str) -> tuple[str, str]:
    path = Path(filename)
    suffix = path.suffix if path.suffix else ""
    stem = path.stem if path.stem else "file"
    return stem, suffix


def build_content_disposition(filename: str, disposition_type: str = "inline") -> str:
    safe_filename = filename.replace("\\", "\\\\").replace('"', '\\"')
    return f'{disposition_type}; filename="{safe_filename}"'


def truncate_utf8(value: str, max_bytes: int) -> str:
    if max_bytes <= 0:
        return ""

    encoded = value.encode("utf-8")
    if len(encoded) <= max_bytes:
        return value

    return encoded[:max_bytes].decode("utf-8", errors="ignore")


def truncate_preserving_extension(filename: str, max_bytes: int = 255) -> str:
    if len(filename.encode("utf-8")) <= max_bytes:
        return filename

    stem, suffix = split_name_and_ext(filename)
    suffix_bytes = len(suffix.encode("utf-8"))

    if suffix_bytes >= max_bytes:
        return truncate_utf8(stem, max_bytes)

    stem_max_bytes = max_bytes - suffix_bytes
    truncated_stem = truncate_utf8(stem, stem_max_bytes).rstrip(" .")
    if not truncated_stem:
        truncated_stem = "file"
    return f"{truncated_stem}{suffix}"
