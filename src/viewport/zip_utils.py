import re
import unicodedata
from pathlib import Path

from viewport.filename_utils import split_name_and_ext, truncate_preserving_extension, truncate_utf8

_ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
_WINDOWS_RESERVED_NAMES = {
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9",
}
_SEPARATOR_LIKE_CHARS = {"/", "\\", "\u2215", "\u2044"}
_FORBIDDEN_ZIP_CHARS_RE = re.compile(r'[<>:"|?*\x00-\x1F]')
_WHITESPACE_RE = re.compile(r"\s+")
_WINDOWS_DRIVE_PREFIX_RE = re.compile(r"^[A-Za-z]:")
_MAX_ZIP_ENTRY_NAME_BYTES = 255
_EXTENSION_ONLY_TOKENS = {ext.lstrip(".") for ext in _ALLOWED_IMAGE_EXTENSIONS}


def sanitize_zip_entry_name(filename: str, fallback: str) -> str:
    normalized = unicodedata.normalize("NFKC", filename or "")
    cleaned = "".join(ch for ch in normalized if unicodedata.category(ch)[0] != "C").strip()
    if not cleaned:
        return fallback

    if any(separator in cleaned for separator in _SEPARATOR_LIKE_CHARS):
        return fallback

    if _WINDOWS_DRIVE_PREFIX_RE.match(cleaned):
        return fallback

    sanitized = _FORBIDDEN_ZIP_CHARS_RE.sub("_", cleaned)
    sanitized = _WHITESPACE_RE.sub(" ", sanitized).strip(" .")

    if not sanitized or sanitized in {".", ".."}:
        return fallback

    if "." not in sanitized and sanitized.casefold() in _EXTENSION_ONLY_TOKENS:
        return fallback

    stem, _ = split_name_and_ext(sanitized)
    if stem.casefold() in _WINDOWS_RESERVED_NAMES:
        return fallback

    sanitized = truncate_preserving_extension(sanitized, max_bytes=_MAX_ZIP_ENTRY_NAME_BYTES)
    if not sanitized or sanitized in {".", ".."}:
        return fallback

    return sanitized


def build_zip_fallback_name(filename: str, object_key: str, fallback_stem: str) -> str:
    normalized = unicodedata.normalize("NFKC", filename or "")
    leaf = normalized.replace("\\", "/").rsplit("/", 1)[-1]
    extension = Path(leaf).suffix.lower()
    if extension in _ALLOWED_IMAGE_EXTENSIONS:
        return f"{fallback_stem}{extension}"

    object_key_extension = Path(object_key).suffix.lower()
    if object_key_extension in _ALLOWED_IMAGE_EXTENSIONS:
        return f"{fallback_stem}{object_key_extension}"

    return f"{fallback_stem}.jpg"


def make_unique_zip_entry_name(filename: str, used_names: set[str]) -> str:
    candidate = filename
    stem, suffix = split_name_and_ext(filename)
    counter = 1

    while candidate.casefold() in used_names:
        suffix_part = f" ({counter})"
        stem_budget = _MAX_ZIP_ENTRY_NAME_BYTES - len(suffix.encode("utf-8"))
        candidate_stem = truncate_utf8(f"{stem}{suffix_part}", stem_budget).rstrip(" .")
        if not candidate_stem:
            candidate_stem = "file"
        candidate = f"{candidate_stem}{suffix}"
        counter += 1

    used_names.add(candidate.casefold())
    return candidate
