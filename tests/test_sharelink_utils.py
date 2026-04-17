from datetime import UTC, datetime, timedelta, timezone

from viewport.sharelink_utils import is_sharelink_expired, normalize_sharelink_expires_at


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


def test_is_sharelink_expired_treats_boundary_as_expired():
    now = datetime.now(UTC).replace(microsecond=0)
    expires_at = now

    assert is_sharelink_expired(expires_at) is True


def test_is_sharelink_expired_is_strictly_future_for_later_timestamps():
    expires_at = datetime.now(UTC).replace(microsecond=0) + timedelta(minutes=5)

    assert is_sharelink_expired(expires_at) is False
