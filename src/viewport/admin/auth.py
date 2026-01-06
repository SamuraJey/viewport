"""Admin authentication backend for SQLAdmin."""

import asyncio

from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.requests import Request

from viewport.api.auth import verify_password
from viewport.models.db import get_db
from viewport.models.user import User


class AdminAuth(AuthenticationBackend):
    """Authentication backend for admin panel using JWT and session."""

    async def login(self, request: Request) -> bool:
        """Authenticate user credentials and store token in session."""
        return await asyncio.to_thread(self._login_sync, request)

    def _login_sync(self, request: Request) -> bool:
        """Synchronous login logic running in thread pool."""
        form_dict = {}
        try:
            loop = asyncio.new_event_loop()
            try:
                form = loop.run_until_complete(request.form())
                form_dict = dict(form)
            finally:
                loop.close()
        except Exception:
            return False

        email = form_dict.get("username")  # SQLAdmin uses 'username' field
        password = form_dict.get("password")

        if not email or not password:
            return False

        # Get database session
        db: Session = next(get_db())
        try:
            stmt = select(User).where(User.email == email)
            user = db.execute(stmt).scalar_one_or_none()

            if not user:
                return False

            if not verify_password(password, user.password_hash):
                return False

            if not user.is_admin:
                return False

            # Store user_id in session for authentication
            request.session.update({"user_id": str(user.id)})
            return True

        finally:
            db.close()

    async def logout(self, request: Request) -> bool:
        """Clear session on logout."""
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        """Verify that user is authenticated and is an admin."""
        return await asyncio.to_thread(self._authenticate_sync, request)

    def _authenticate_sync(self, request: Request) -> bool:
        """Synchronous authentication logic running in thread pool."""
        user_id = request.session.get("user_id")

        if not user_id:
            return False

        # Verify user still exists and is admin
        db: Session = next(get_db())
        try:
            stmt = select(User).where(User.id == user_id)
            user = db.execute(stmt).scalar_one_or_none()

            return bool(user and user.is_admin)

        finally:
            db.close()
