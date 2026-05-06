from datetime import datetime
from typing import NamedTuple

from viewport.models.sharelink_selection import SelectionSessionStatus

NOT_STARTED_SELECTION_STATUS = "not_started"


class ShareLinkSelectionSummaryAggregate(NamedTuple):
    """Named aggregate returned by repositories for share-link selection summaries."""

    is_enabled: bool
    total_sessions: int
    submitted_sessions: int
    in_progress_sessions: int
    closed_sessions: int
    selected_count: int
    latest_activity_at: datetime | None


EMPTY_SHARELINK_SELECTION_SUMMARY = ShareLinkSelectionSummaryAggregate(
    is_enabled=False,
    total_sessions=0,
    submitted_sessions=0,
    in_progress_sessions=0,
    closed_sessions=0,
    selected_count=0,
    latest_activity_at=None,
)


def selection_rollup_status(
    total_sessions: int,
    submitted_sessions: int,
    in_progress_sessions: int,
    closed_sessions: int,
) -> str:
    """Collapse per-status session counts into the owner/dashboard display status."""

    if total_sessions <= 0:
        return NOT_STARTED_SELECTION_STATUS
    if submitted_sessions > 0:
        return SelectionSessionStatus.SUBMITTED.value
    if in_progress_sessions > 0:
        return SelectionSessionStatus.IN_PROGRESS.value
    if closed_sessions > 0:
        return SelectionSessionStatus.CLOSED.value
    return NOT_STARTED_SELECTION_STATUS
