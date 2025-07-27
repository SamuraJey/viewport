from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.viewport.models.user import User

from .api.auth import router as auth_router
from .api.gallery import router as gallery_router
from .api.photo import router as photo_router, photo_auth_router
from .api.public import router as public_router
from .api.sharelink import router as sharelink_router
from .auth_utils import get_current_user
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
# app.include_router(files_router)
setup_metrics(app)


@app.get("/")
def read_root():
    return {"message": "Hello from viewport!"}


@app.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": str(current_user.id), "email": current_user.email}
