import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from viewport.api.auth import router as auth_router
from viewport.api.gallery import router as gallery_router
from viewport.api.photo import router as photo_router
from viewport.api.public import router as public_router
from viewport.api.sharelink import router as sharelink_router
from viewport.api.user import router as user_router
from viewport.dependencies import get_s3_client_instance, set_s3_client_instance
from viewport.metrics import setup_metrics
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
        logger.error(f"Failed to initialize S3 client: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down application...")
    try:
        s3_client = get_s3_client_instance()
        await s3_client.close()
        logger.info("S3 client closed successfully")
    except Exception as e:
        logger.error(f"Error during S3 client shutdown: {e}")


# Create FastAPI app with lifespan
app = FastAPI(redoc_url=None, redirect_slashes=False, lifespan=lifespan)  # TODO add env var check for production

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://192.168.1.50:5173",
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


@app.get("/")
def read_root():
    return {"message": "Hello from viewport!"}
