from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.minio_utils import get_file_url, upload_fileobj
from src.viewport.models.gallery import Gallery, Photo
from src.viewport.schemas.photo import PhotoResponse

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

router = APIRouter(prefix="/galleries/{gallery_id}/photos", tags=["photos"])


@router.post("", response_model=PhotoResponse, status_code=status.HTTP_201_CREATED)
def upload_photo(gallery_id: UUID, file: UploadFile = File(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Check gallery ownership
    gallery = db.query(Gallery).filter_by(id=gallery_id, owner_id=current_user.id).first()
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Validate file size
    contents = file.file.read()
    file_size = len(contents)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 15MB)")

    # Upload to MinIO
    filename = f"{gallery_id}/{file.filename}"
    upload_fileobj(fileobj=bytes(contents), filename=filename)
    url_s3 = get_file_url(filename)

    # Save Photo record
    photo = Photo(gallery_id=gallery_id, url_s3=url_s3, file_size=file_size)
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo
