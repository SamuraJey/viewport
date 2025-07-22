import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from src.viewport.models.user import Base


class Gallery(Base):
    __tablename__ = "galleries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", backref="galleries")


class Photo(Base):
    __tablename__ = "photos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gallery_id = Column(UUID(as_uuid=True), ForeignKey("galleries.id", ondelete="CASCADE"), nullable=False)
    url_s3 = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    gallery = relationship(Gallery, back_populates="photos")


Gallery.photos = relationship(Photo, back_populates="gallery", cascade="all, delete-orphan")
Gallery.share_links = relationship("ShareLink", back_populates="gallery", cascade="all, delete-orphan")
