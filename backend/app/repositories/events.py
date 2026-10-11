from app.repositories.base import insert_many, rows, table


def add_many(items: list[dict]) -> None:
    if items:
        insert_many("events", items)


def search(kind: str | None = None, severity: str | None = None, before_id: int | None = None, limit: int = 100) -> list[dict]:
    q = table("events").select("*")
    if kind:
        q = q.like("kind", f"{kind}%")
    if severity:
        q = q.eq("severity", severity)
    if before_id:
        q = q.lt("id", before_id)
    return rows(q.order("id", desc=True).limit(limit))
