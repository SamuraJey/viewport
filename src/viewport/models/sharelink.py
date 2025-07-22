import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from src.viewport.db import Base


class ShareLink(Base):
    __tablename__ = "share_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gallery_id = Column(UUID(as_uuid=True), ForeignKey("galleries.id"), nullable=False)
    expires_at = Column(DateTime, nullable=True)
    views = Column(Integer, default=0, nullable=False)
    zip_downloads = Column(Integer, default=0, nullable=False)
    single_downloads = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    gallery = relationship("Gallery", back_populates="share_links")
