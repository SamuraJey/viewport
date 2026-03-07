from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


class BaseRepository:
    """Base repository class with common database session functionality."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _finish_read(self, value: T) -> T:
        """End read-only transactions promptly so connections return to the pool."""
        if self.db.in_transaction():
            await self.db.commit()
        return value
