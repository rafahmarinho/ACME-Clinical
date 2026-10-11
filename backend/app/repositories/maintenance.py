from app.repositories.base import first, rows, table


def search(status: str | None = None, monitor_id: str | None = None, limit: int = 200) -> list[dict]:
    q = table("maintenance_records").select("*")
    if status:
        q = q.eq("status", status)
    if monitor_id:
        q = q.eq("monitor_id", monitor_id)
    return rows(q.order("created_at", desc=True).limit(limit))


def get(record_id: str) -> dict | None:
    return first(table("maintenance_records").select("*").eq("id", record_id))


def add(values: dict) -> dict:
    return table("maintenance_records").insert(values).execute().data[0]


def update(record_id: str, values: dict) -> dict | None:
    data = table("maintenance_records").update(values).eq("id", record_id).execute().data
    return data[0] if data else None
