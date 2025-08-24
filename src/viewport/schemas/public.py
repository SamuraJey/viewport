from pydantic import BaseModel


class PublicPhoto(BaseModel):
    photo_id: str
    thumbnail_url: str
    full_url: str


class PublicCover(BaseModel):
    photo_id: str
    thumbnail_url: str
    full_url: str


class PublicGalleryResponse(BaseModel):
    photos: list[PublicPhoto]
    cover: PublicCover | None = None
    photographer: str = ""
    gallery_name: str = ""
    date: str = ""
    site_url: str = ""
