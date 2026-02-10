from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from viewport.api.auth import hash_password, verify_password
from viewport.auth_utils import get_current_user
from viewport.models.db import get_db
from viewport.models.user import User
from viewport.repositories.user_repository import UserRepository
from viewport.schemas.auth import ChangePasswordRequest, MeResponse, UpdateMeRequest

router = APIRouter(tags=["user"])


def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


@router.get("/me", response_model=MeResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "display_name": current_user.display_name,
        "storage_used": current_user.storage_used,
        "storage_quota": current_user.storage_quota,
    }


@router.put("/me", response_model=MeResponse)
def update_me(req: UpdateMeRequest, repo: UserRepository = Depends(get_user_repository), current_user: User = Depends(get_current_user)):
    user = repo.update_user_display_name(current_user.id, req.display_name)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "storage_used": user.storage_used,
        "storage_quota": user.storage_quota,
    }


@router.put("/me/password", status_code=status.HTTP_200_OK)
def change_password(req: ChangePasswordRequest, repo: UserRepository = Depends(get_user_repository), current_user: User = Depends(get_current_user)):
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password and confirmation do not match")
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user = repo.update_user_password(current_user.id, hash_password(req.new_password))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Password updated successfully"}
