"""Supabase Auth admin operations (service role)."""

from app.db.client import get_db


def create_user(email: str, password: str, metadata: dict) -> str:
    res = get_db().auth.admin.create_user(
        {"email": email, "password": password, "email_confirm": True, "user_metadata": metadata}
    )
    return res.user.id


def set_banned(user_id: str, banned: bool) -> None:
    get_db().auth.admin.update_user_by_id(user_id, {"ban_duration": "876000h" if banned else "none"})


def list_users() -> list:
    users = []
    page = 1
    while True:
        batch = get_db().auth.admin.list_users(page=page, per_page=200)
        users.extend(batch)
        if len(batch) < 200:
            return users
        page += 1
