from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from src.viewport.api.auth import hash_password, verify_password
from src.viewport.db import get_db
from src.viewport.models.user import User
from src.viewport.schemas.auth import ChangePasswordRequest, MeResponse, UpdateMeRequest

from .api.auth import router as auth_router
from .api.gallery import router as gallery_router
from .api.photo import photo_auth_router
from .api.photo import router as photo_router
from .api.public import router as public_router
from .api.sharelink import router as sharelink_router
from .auth_utils import get_current_user
from .metrics import setup_metrics

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(gallery_router)
app.include_router(photo_router)
app.include_router(photo_auth_router)
app.include_router(sharelink_router)
app.include_router(public_router)

setup_metrics(app)


@app.get("/")
def read_root():
    return {"message": "Hello from viewport!"}


@app.get("/me", response_model=MeResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": str(current_user.id), "email": current_user.email, "display_name": current_user.display_name}


@app.put("/me", response_model=MeResponse)
def update_me(req: UpdateMeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Update display_name
    current_user.display_name = req.display_name
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {"id": str(current_user.id), "email": current_user.email, "display_name": current_user.display_name}


@app.put("/me/password", status_code=status.HTTP_200_OK)
def change_password(req: ChangePasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Validate new and confirm
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password and confirmation do not match")
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    # Hash and set new password
    current_user.password_hash = hash_password(req.new_password)
    db.add(current_user)
    db.commit()
    return {"message": "Password updated successfully"}
