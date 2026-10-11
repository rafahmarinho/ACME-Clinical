from app.repositories.base import first, rows, table, upsert_many


def get(alarm_id: str) -> dict | None:
    return first(table("alarms").select("*").eq("id", alarm_id))


def active() -> list[dict]:
    return rows(table("alarms").select("*").eq("condition_active", True).order("started_at", desc=True))


def search(
    *,
    status: str = "all",
    severity: str | None = None,
    category: str | None = None,
    patient_id: str | None = None,
    monitor_id: str | None = None,
    since: str | None = None,
    limit: int = 200,
) -> list[dict]:
    """status: active (unacknowledged), acknowledged (still active), open (either), resolved, all."""
    q = table("alarms").select("*")
    if status == "active":
        q = q.eq("condition_active", True).is_("acknowledged_at", "null")
    elif status == "acknowledged":
        q = q.eq("condition_active", True).not_.is_("acknowledged_at", "null")
    elif status == "open":
        q = q.eq("condition_active", True)
    elif status == "resolved":
        q = q.eq("condition_active", False)
    if severity:
        q = q.eq("severity", severity)
    if category:
        q = q.eq("category", category)
    if patient_id:
        q = q.eq("patient_id", patient_id)
    if monitor_id:
        q = q.eq("monitor_id", monitor_id)
    if since:
        q = q.gte("started_at", since)
    return rows(q.order("started_at", desc=True).limit(limit))


def update(alarm_id: str, values: dict) -> dict | None:
    data = table("alarms").update(values).eq("id", alarm_id).execute().data
    return data[0] if data else None


def save_many(items: list[dict]) -> None:
    if items:
        upsert_many("alarms", items)
