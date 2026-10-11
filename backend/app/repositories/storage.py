from app.db.client import get_db


def upload(bucket: str, path: str, content: bytes, content_type: str) -> None:
    get_db().storage.from_(bucket).upload(path, content, {"content-type": content_type, "upsert": "true"})


def signed_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    res = get_db().storage.from_(bucket).create_signed_url(path, expires_in)
    return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")


def public_url(bucket: str, path: str) -> str:
    return get_db().storage.from_(bucket).get_public_url(path)


def remove(bucket: str, paths: list[str]) -> None:
    if paths:
        get_db().storage.from_(bucket).remove(paths)
