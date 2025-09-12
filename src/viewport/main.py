from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Routers
from .api.auth import router as auth_router
from .api.gallery import router as gallery_router
from .api.photo import photo_auth_router
from .api.photo import router as photo_router
from .api.public import router as public_router
from .api.sharelink import router as sharelink_router
from .api.user import router as user_router

# Import logger early to configure logging levels for botocore and other libraries
from .logger import logger  # noqa: F401
from .metrics import setup_metrics

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
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
