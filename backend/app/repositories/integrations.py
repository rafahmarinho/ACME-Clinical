from app.repositories.base import insert_many, rows, table


def add_many(items: list[dict]) -> None:
    if items:
        insert_many("integration_messages", items)


def search(channel: str | None = None, limit: int = 100) -> list[dict]:
    q = table("integration_messages").select("*")
    if channel:
        q = q.eq("channel", channel)
    return rows(q.order("id", desc=True).limit(limit))
