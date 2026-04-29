"""Admin authentication backend for SQLAdmin."""

from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request

from viewport.api.auth import verify_password
from viewport.models.db import get_session_maker
from viewport.models.user import User


class AdminAuth(AuthenticationBackend):
    """Authentication backend for admin panel using JWT and session."""

    def __init__(self, secret_key: str):
        super().__init__(secret_key)
        self._session_maker: async_sessionmaker[AsyncSession] | None = None

    def _get_session_maker(self) -> async_sessionmaker[AsyncSession]:
        """Return the admin DB session factory, initializing it lazily.

        ``viewport.main`` constructs this backend at import time so SQLAdmin can
        be attached to the FastAPI app.  Resolving the sessionmaker there also
        resolves ``DatabaseSettings`` and creates an engine, which makes import-
        only tests and tooling depend on ambient database environment variables.
        Keep database access on the request path instead.
        """
        if self._session_maker is None:
            self._session_maker = get_session_maker()
        return self._session_maker

    async def authenticate(self, request: Request) -> bool:
        """Return True if a user is currently authenticated for the admin."""
        user_id = request.session.get("user_id")
        if not user_id:
            return False

        session_maker = self._get_session_maker()
        async with session_maker() as session:
            stmt = select(User.is_admin).where(User.id == user_id)
            is_admin = (await session.execute(stmt)).scalar_one_or_none()
            return bool(is_admin)

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

        session_maker = self._get_session_maker()
        async with session_maker() as session:
            stmt = select(User).where(User.email == email)
            user = (await session.execute(stmt)).scalar_one_or_none()

        if not user:
            return False

        is_valid = await run_in_threadpool(verify_password, password, user.password_hash)
        if not is_valid or not user.is_admin:
            return False

        user_id = str(user.id)
        if user_id:
            # Store user_id in session for authentication
            request.session.update({"user_id": user_id})
            return True

        return False
