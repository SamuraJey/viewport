from fastapi import APIRouter, Depends, HTTPException, status
from starlette.concurrency import run_in_threadpool

from viewport.api.auth import hash_password, verify_password
from viewport.auth_utils import get_current_user
from viewport.dependencies import get_user_repository
from viewport.models.user import User
from viewport.repositories.refresh_token_repository import RefreshTokenRepository
from viewport.repositories.user_repository import UserRepository
from viewport.schemas.auth import ChangePasswordRequest, MeResponse, UpdateMeRequest

router = APIRouter(tags=["user"])


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

    refresh_sessions = RefreshTokenRepository(repo.db)
    if not await refresh_sessions.lock_user_for_update(current_user.id):
        await repo.db.rollback()
        raise HTTPException(status_code=404, detail="User not found")
    locked_password_hash = await repo.get_user_password_hash(current_user.id)
    if locked_password_hash is None:
        await repo.db.rollback()
        raise HTTPException(status_code=404, detail="User not found")
    if locked_password_hash != current_user.password_hash:
        await repo.db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Password changed concurrently")

    await refresh_sessions.revoke_all_for_user(current_user.id, commit=False, lock_user=False)
    user = await repo.update_user_password(
        current_user.id,
        hashed_password,
        commit=False,
        lock_for_update=False,
    )
    if not user:
        await repo.db.rollback()
        raise HTTPException(status_code=404, detail="User not found")
    await repo.db.commit()
    return {"message": "Password updated successfully"}
