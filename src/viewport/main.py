import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqladmin import Admin
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse

from viewport.admin import AdminAuth, GalleryAdmin, PhotoAdmin, ShareLinkAdmin, UserAdmin
from viewport.api.auth import router as auth_router
from viewport.api.gallery import router as gallery_router
from viewport.api.photo import router as photo_router
from viewport.api.public import router as public_router
from viewport.api.sharelink import router as sharelink_router
from viewport.api.user import router as user_router
from viewport.auth_utils import authsettings
from viewport.dependencies import get_s3_client_instance, set_s3_client_instance
from viewport.metrics import setup_metrics
from viewport.models.db import get_engine
from viewport.s3_service import AsyncS3Client

# Configure logging early: uvicorn imports this module when starting the app
from .logging_config import configure_logging

# Configure logging for the whole process (uvicorn imports this module when
# starting the app, so configure_logging runs early and affects uvicorn loggers)
configure_logging(level="INFO")

# Configure external libraries logging levels to reduce noise
logging.getLogger("botocore").setLevel(logging.WARNING)
logging.getLogger("boto3").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("botocore.auth").setLevel(logging.WARNING)
logging.getLogger("botocore.endpoint").setLevel(logging.WARNING)
logging.getLogger("botocore.retryhandler").setLevel(logging.DEBUG)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: startup and shutdown.

    This context manager initializes the S3 client on startup and cleans up
    resources on shutdown.
    """
    # Startup
    logger.info("Starting up application...")
    try:
        s3_client = AsyncS3Client()
        set_s3_client_instance(s3_client)
        logger.info("S3 client initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize S3 client: %s", e)
        raise

    yield

    # Shutdown
    logger.info("Shutting down application...")
    try:
        s3_client = get_s3_client_instance()
        await s3_client.close()
        logger.info("S3 client closed successfully")
    except Exception as e:
        logger.error("Error during S3 client shutdown: %s", e)


# Create FastAPI app with lifespan
app = FastAPI(redoc_url=None, redirect_slashes=False, lifespan=lifespan)  # TODO add env var check for production

# Add session middleware (required for SQLAdmin authentication)


app.add_middleware(
    SessionMiddleware,
    secret_key=authsettings.jwt_secret_key,
    max_age=1800,  # 30 minutes
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://192.168.1.50:5173",
        "http://192.168.1.50:4173",
        "http://192.168.1.15:3000",
        "http://192.168.1.50:3000",
        "https://samuraj.su",
        "https://backend.samuraj.su",
        "https://backend.samuraj.su:4443",
        "https://viewport.samuraj.su:4443",
    ],
    allow_origin_regex=r"https://.*\.samuraj\.su(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(gallery_router)
app.include_router(photo_router)
app.include_router(sharelink_router)
app.include_router(public_router)
app.include_router(user_router)

setup_metrics(app)

# Initialize SQLAdmin


authentication_backend = AdminAuth(secret_key=authsettings.jwt_secret_key)
admin = Admin(
    app,
    get_engine(),
    base_url="/admin",
    authentication_backend=authentication_backend,
    title="Viewport Admin",
)

# Register model views
admin.add_view(UserAdmin)
admin.add_view(GalleryAdmin)
admin.add_view(PhotoAdmin)
admin.add_view(ShareLinkAdmin)


@app.get("/")
async def read_root():
    return {"message": "Hello from viewport!"}


@app.get("/admin")
async def redirect_to_admin():
    """Redirect /admin to /admin/ for SQLAdmin compatibility."""
    return RedirectResponse(url="/admin/")
