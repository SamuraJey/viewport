from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from viewport.api.auth import hash_password, verify_password
from viewport.auth_utils import get_current_user
from viewport.models.db import get_db
from viewport.models.user import User
from viewport.repositories.user_repository import UserRepository
from viewport.schemas.auth import ChangePasswordRequest, MeResponse, UpdateMeRequest

router = APIRouter(tags=["user"])


def get_user_repository(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


@router.get("/me", response_model=MeResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=str(current_user.id),
        email=current_user.email,
        display_name=current_user.display_name,
        storage_used=current_user.storage_used,
        storage_quota=current_user.storage_quota,
    )


@router.put("/me", response_model=MeResponse)
async def update_me(req: UpdateMeRequest, repo: UserRepository = Depends(get_user_repository), current_user: User = Depends(get_current_user)) -> MeResponse:
    user = await repo.update_user_display_name(current_user.id, req.display_name)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return MeResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        storage_used=user.storage_used,
        storage_quota=user.storage_quota,
    )


@router.put("/me/password", status_code=status.HTTP_200_OK)
async def change_password(req: ChangePasswordRequest, repo: UserRepository = Depends(get_user_repository), current_user: User = Depends(get_current_user)) -> dict[str, str]:
    """Change password."""
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password and confirmation do not match")

    is_valid = await run_in_threadpool(verify_password, req.current_password, current_user.password_hash)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    hashed_password = await run_in_threadpool(hash_password, req.new_password)

    user = await repo.update_user_password(current_user.id, hashed_password)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Password updated successfully"}
