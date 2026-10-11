import time

from app.core.errors import BadRequest
from app.core.security import CurrentUser
from app.repositories import profiles as profiles_repo
from app.repositories import storage

ALLOWED_IMAGES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024

DEFAULT_PREFERENCES = {
    "alarm_sound": True,
    "auto_advance": False,
    "default_ward": None,
    "density": "comfortable",
    "temperature_unit": "C",
    "show_waveforms": True,
    "notify_critical": True,
}


def me(user: CurrentUser) -> dict:
    p = profiles_repo.get(user.id) or user.profile
    return {**p, "preferences": {**DEFAULT_PREFERENCES, **(p.get("preferences") or {})}}


def update_me(user: CurrentUser, values: dict) -> dict:
    if "preferences" in values:
        current = (profiles_repo.get(user.id) or {}).get("preferences") or {}
        values["preferences"] = {**current, **values["preferences"]}
    profiles_repo.update(user.id, values)
    return me(user)


def upload_avatar(user: CurrentUser, content: bytes, content_type: str) -> dict:
    ext = ALLOWED_IMAGES.get(content_type)
    if ext is None:
        raise BadRequest("Please upload a PNG, JPEG or WebP image")
    if len(content) > MAX_AVATAR_BYTES:
        raise BadRequest("The image must be 2 MB or smaller")
    path = f"{user.id}/avatar-{int(time.time())}.{ext}"
    storage.upload("avatars", path, content, content_type)
    url = storage.public_url("avatars", path)
    profiles_repo.update(user.id, {"avatar_url": url})
    return me(user)
