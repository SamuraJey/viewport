import re


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
