from fastapi import FastAPI, Depends
from .api.auth import router as auth_router
from .api.gallery import router as gallery_router
from .api.photo import router as photo_router


from .auth_utils import get_current_user
from src.app.models.user import User


app = FastAPI()
app.include_router(auth_router)
app.include_router(gallery_router)
app.include_router(photo_router)


@app.get("/")
def read_root():
    return {"message": "Hello from viewport!"}


@app.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": str(current_user.id), "email": current_user.email}
