import json
import logging
from datetime import datetime


class StructuredLogger(logging.Logger):
    def __init__(self, name):
        super().__init__(name)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        self.addHandler(handler)
        self.setLevel(logging.INFO)

    def log_event(self, event_type, share_id=None, user_id=None, extra=None):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": event_type,
            "share_id": str(share_id) if share_id else None,
            "user_id": str(user_id) if user_id else None,
            "extra": extra or {},
        }
        self.info(json.dumps(log_entry))


logger = StructuredLogger("viewport")
