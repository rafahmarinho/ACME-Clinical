from fastapi import APIRouter, Depends, File, UploadFile

from app.core.security import CurrentUser, get_current_user
from app.schemas.requests import ProfileUpdate
from app.services import profile as profile_service

router = APIRouter(prefix="/me", tags=["profile"])


@router.get("")
def get_me(user: CurrentUser = Depends(get_current_user)):
    return profile_service.me(user)


@router.patch("")
def update_me(body: ProfileUpdate, user: CurrentUser = Depends(get_current_user)):
    values = body.model_dump(exclude_unset=True)
    if "preferences" in values and values["preferences"] is not None:
        values["preferences"] = {k: v for k, v in values["preferences"].items() if v is not None or k == "default_ward"}
    return profile_service.update_me(user, values)


@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)):
    content = await file.read()
    return profile_service.upload_avatar(user, content, file.content_type or "")
