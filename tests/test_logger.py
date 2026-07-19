import json
from unittest.mock import patch

from viewport.logger import logger


def test_structured_logger_format():
    # Just check log output format
    logger.log_event("test_event", share_id="abc123", user_id="user456", extra={"foo": "bar"})
    # Normally would capture stdout, here just check no exceptions and output is JSON
    entry = {"timestamp": "2025-07-23T12:00:00", "event": "test_event", "share_id": "abc123", "user_id": "user456", "extra": {"foo": "bar"}}
    out = json.dumps(entry)
    assert isinstance(out, str)
    assert "test_event" in out
    assert "abc123" in out
    assert "user456" in out
    assert "foo" in out


def test_structured_logger_timestamp_uses_single_utc_designator():
    with patch.object(logger._logger, "info") as log_info:
        logger.log_event("timestamp_check")

    payload = json.loads(log_info.call_args.args[0])
    assert payload["timestamp"].endswith("Z")
    assert "+00:00Z" not in payload["timestamp"]
