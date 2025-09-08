from sqlalchemy.orm import Session


class BaseRepository:
    """Base repository class with common database session functionality."""

    def __init__(self, db: Session):
        self.db = db
