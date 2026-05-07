LIKE_ESCAPE_CHAR = "\\"


def escape_like_term(value: str, escape_char: str = LIKE_ESCAPE_CHAR) -> str:
    """Escape SQL LIKE wildcards so user search text is treated literally."""

    return value.replace(escape_char, escape_char * 2).replace("%", f"{escape_char}%").replace("_", f"{escape_char}_")


def literal_like_pattern(value: str, escape_char: str = LIKE_ESCAPE_CHAR) -> str:
    """Build a contains-match LIKE pattern for already-normalized user search text."""

    return f"%{escape_like_term(value, escape_char)}%"
