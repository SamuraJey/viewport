from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PhotoCreateRequest(BaseModel):
    file_size: int = Field(..., ge=1)
    # file will be handled as UploadFile in endpoint, not in schema


class PhotoResponse(BaseModel):
    id: UUID
    gallery_id: UUID
    url: str
    file_size: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_db_photo(cls, photo):
        """Create PhotoResponse from database Photo model"""
        # Generate token-based URL for better caching
        from datetime import datetime, timedelta, UTC
        import jwt
        from ..api.auth import JWT_SECRET, JWT_ALGORITHM
        
        # Create a photo access token that's valid for 24 hours
        payload = {
            "user_id": str(photo.gallery.owner_id),
            "photo_id": str(photo.id),
            "exp": datetime.now(UTC) + timedelta(hours=24)
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        
        return cls(
            id=photo.id,
            gallery_id=photo.gallery_id,
            url=f"/photos/auth/{photo.id}?token={token}",
            file_size=photo.file_size,
            uploaded_at=photo.uploaded_at
        )


class PhotoListResponse(BaseModel):
    photos: list[PhotoResponse]
    total: int
    page: int
    size: int
