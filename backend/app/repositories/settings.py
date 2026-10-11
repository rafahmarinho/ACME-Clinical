from app.repositories.base import rows, table, upsert_many


def all_settings() -> dict:
    return {r["key"]: r["value"] for r in rows(table("app_settings").select("*"))}


def save(values: dict, user_id: str | None = None) -> None:
    upsert_many(
        "app_settings",
        [{"key": k, "value": v, "updated_by": user_id} for k, v in values.items()],
        on_conflict="key",
    )
