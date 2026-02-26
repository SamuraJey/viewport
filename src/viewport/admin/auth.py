"""Admin authentication backend for SQLAdmin."""

from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request

from viewport.api.auth import verify_password
from viewport.models.db import get_db
from viewport.models.user import User


class AdminAuth(AuthenticationBackend):
    """Authentication backend for admin panel using JWT and session."""

    async def authenticate(self, request: Request) -> bool:
        """Return True if a user is currently authenticated for the admin."""
        user_id = request.session.get("user_id")
        return bool(user_id)

    async def logout(self, request: Request) -> bool:
        """Log out the current user by clearing the admin session."""
        # Remove user_id from the session if it exists
        request.session.pop("user_id", None)
        return True

    async def login(self, request: Request) -> bool:
        """Authenticate user credentials and store token in session."""
        return await self._login_async(request)

    async def _login_async(self, request: Request) -> bool:
        """Asynchronous login logic handling form parsing and DB query."""
        form_dict = {}
        try:
            form = await request.form()
            form_dict = dict(form)
        except Exception:
            return False

        email = form_dict.get("username")  # SQLAdmin uses 'username' field
        password = form_dict.get("password")

        if not isinstance(email, str) or not isinstance(password, str):
            return False

        if not email or not password:
            return False

        # Run DB and crypto operations in threadpool
        def _check_credentials():
            db: Session = next(get_db())
            try:
                stmt = select(User).where(User.email == email)
                user = db.execute(stmt).scalar_one_or_none()

                if not user:
                    return None

                if not verify_password(password, user.password_hash):
                    return None

                if not user.is_admin:
                    return None

                return str(user.id)

            finally:
                db.close()

        user_id = await run_in_threadpool(_check_credentials)

        if user_id:
            # Store user_id in session for authentication
            request.session.update({"user_id": user_id})
            return True

        return False
