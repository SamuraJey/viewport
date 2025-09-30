import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from viewport.api.auth import router as auth_router
from viewport.api.gallery import router as gallery_router
from viewport.api.photo import photo_auth_router
from viewport.api.photo import router as photo_router
from viewport.api.public import router as public_router
from viewport.api.sharelink import router as sharelink_router
from viewport.api.user import router as user_router
from viewport.metrics import setup_metrics

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


app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.1.50:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(gallery_router)
app.include_router(photo_router)
app.include_router(photo_auth_router)
app.include_router(sharelink_router)
app.include_router(public_router)
app.include_router(user_router)

setup_metrics(app)


@app.get("/")
def read_root():
    return {"message": "Hello from viewport!"}
