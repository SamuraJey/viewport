from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.viewport.api.auth import hash_password, verify_password
from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.models.user import User
from src.viewport.schemas.auth import ChangePasswordRequest, MeResponse, UpdateMeRequest

router = APIRouter(tags=["user"])


@router.get("/me", response_model=MeResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": str(current_user.id), "email": current_user.email, "display_name": current_user.display_name}


@router.put("/me", response_model=MeResponse)
def update_me(req: UpdateMeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.display_name = req.display_name
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {"id": str(current_user.id), "email": current_user.email, "display_name": current_user.display_name}


@router.put("/me/password", status_code=status.HTTP_200_OK)
def change_password(req: ChangePasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password and confirmation do not match")
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.password_hash = hash_password(req.new_password)
    db.add(current_user)
    db.commit()
    return {"message": "Password updated successfully"}
