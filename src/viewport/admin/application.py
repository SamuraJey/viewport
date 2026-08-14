from collections.abc import Awaitable

from sqladmin import Admin
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import Response


class ViewportAdmin(Admin):
    """SQLAdmin application that preserves security-relevant error headers."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)  # type: ignore[arg-type]

        async def http_exception(
            request: Request,
            exc: Exception,
        ) -> Response | Awaitable[Response]:
            if not isinstance(exc, HTTPException):
                raise TypeError(f"Expected HTTPException, got {type(exc)}")

            response = await self.templates.TemplateResponse(
                request,
                "sqladmin/error.html",
                {
                    "status_code": exc.status_code,
                    "message": exc.detail,
                },
                status_code=exc.status_code,
            )
            if exc.headers:
                response.headers.update(exc.headers)
            return response

        self.admin.exception_handlers = {HTTPException: http_exception}
