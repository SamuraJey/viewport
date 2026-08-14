"""Low-cardinality security metrics for refresh rotation and auth throttling."""

from prometheus_client import Counter, Histogram

AUTH_RATE_LIMIT_DECISIONS = Counter(
    "viewport_auth_rate_limit_decisions_total",
    "Authentication rate-limit decisions.",
    ("route", "backend", "decision"),
)

REFRESH_ROTATIONS = Counter(
    "viewport_auth_refresh_rotations_total",
    "Successfully committed refresh-token rotations.",
)

REFRESH_REJECTS = Counter(
    "viewport_auth_refresh_rejects_total",
    "Rejected refresh-token requests.",
    ("reason",),
)

REFRESH_FAMILIES_REVOKED = Counter(
    "viewport_auth_refresh_families_revoked_total",
    "Refresh-token families revoked by security policy.",
    ("reason",),
)

REFRESH_SESSION_CLEANUP_ROWS = Counter(
    "viewport_auth_refresh_session_cleanup_rows_total",
    "Expired or audit-retention-complete refresh sessions deleted.",
)

REFRESH_SESSION_CLEANUP_DURATION = Histogram(
    "viewport_auth_refresh_session_cleanup_duration_seconds",
    "Time spent cleaning durable refresh-session state.",
)
