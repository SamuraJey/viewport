from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class GalleryCreateRequest(BaseModel):
    pass  # No fields needed, just creates for current user


class GalleryResponse(BaseModel):
    id: str
    owner_id: str
    created_at: datetime


class GalleryListResponse(BaseModel):
    galleries: list[GalleryResponse]
    total: int
    page: int
    size: int
