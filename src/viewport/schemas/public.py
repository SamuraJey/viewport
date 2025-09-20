from pydantic import BaseModel


class PublicPhoto(BaseModel):
    photo_id: str
    thumbnail_url: str
    full_url: str
    filename: str | None = None
    width: int | None = None
    height: int | None = None


class PublicCover(BaseModel):
    photo_id: str
    thumbnail_url: str
    full_url: str
    filename: str | None = None
    width: int | None = None
    height: int | None = None


class PublicGalleryResponse(BaseModel):
    photos: list[PublicPhoto]
    cover: PublicCover | None = None
    photographer: str = ""
    gallery_name: str = ""
    date: str = ""
    site_url: str = ""
