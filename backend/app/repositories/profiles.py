from app.repositories.base import first, rows, table


def get(user_id: str) -> dict | None:
    return first(table("profiles").select("*").eq("id", user_id))


def list_all() -> list[dict]:
    return rows(table("profiles").select("*").order("full_name"))


def update(user_id: str, values: dict) -> dict | None:
    data = table("profiles").update(values).eq("id", user_id).execute().data
    return data[0] if data else None


def by_role(role: str) -> list[dict]:
    return rows(table("profiles").select("*").eq("role", role).eq("is_active", True).order("full_name"))
