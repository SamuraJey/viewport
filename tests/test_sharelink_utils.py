from datetime import UTC, datetime, timedelta, timezone

from viewport.sharelink_utils import normalize_sharelink_expires_at


def test_normalize_sharelink_expires_at_treats_naive_datetimes_as_utc():
    naive_expires_at = datetime(2026, 3, 29, 12, 0, 0)

    normalized = normalize_sharelink_expires_at(naive_expires_at)

    assert normalized == naive_expires_at.replace(tzinfo=UTC)
    assert normalized is not None
    assert normalized.tzinfo == UTC


def test_normalize_sharelink_expires_at_converts_aware_datetimes_to_utc():
    aware_expires_at = datetime(2026, 3, 29, 15, 0, 0, tzinfo=timezone(timedelta(hours=3)))

    normalized = normalize_sharelink_expires_at(aware_expires_at)

    assert normalized == datetime(2026, 3, 29, 12, 0, 0, tzinfo=UTC)
    assert normalized is not None
    assert normalized.tzinfo == UTC
