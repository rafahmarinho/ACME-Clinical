from app.repositories.base import first, rows, table, upsert_many


def list_all() -> list[dict]:
    return rows(table("monitors").select("*").order("serial"))


def get(monitor_id: str) -> dict | None:
    return first(table("monitors").select("*").eq("id", monitor_id))


def by_bed(bed_id: str) -> dict | None:
    return first(table("monitors").select("*").eq("bed_id", bed_id))


def update(monitor_id: str, values: dict) -> dict | None:
    data = table("monitors").update(values).eq("id", monitor_id).execute().data
    return data[0] if data else None


def save_many(items: list[dict]) -> None:
    if items:
        upsert_many("monitors", items)


def assignments(monitor_id: str, limit: int = 20) -> list[dict]:
    return rows(
        table("monitor_assignments").select("*").eq("monitor_id", monitor_id).order("assigned_at", desc=True).limit(limit)
    )


def open_assignment(monitor_id: str) -> dict | None:
    return first(table("monitor_assignments").select("*").eq("monitor_id", monitor_id).is_("unassigned_at", "null"))


def add_assignment(values: dict) -> dict:
    return table("monitor_assignments").insert(values).execute().data[0]


def close_assignment(assignment_id: str, values: dict) -> None:
    table("monitor_assignments").update(values).eq("id", assignment_id).execute()
