from datetime import UTC, datetime


def normalize_sharelink_expires_at(expires_at: datetime | None) -> datetime | None:
    if expires_at is None:
        return None
    if expires_at.tzinfo is None:
        return expires_at.replace(tzinfo=UTC)
    return expires_at.astimezone(UTC)


def is_sharelink_expired(expires_at: datetime | None) -> bool:
    normalized_expires_at = normalize_sharelink_expires_at(expires_at)
    return bool(normalized_expires_at and normalized_expires_at <= datetime.now(UTC))
