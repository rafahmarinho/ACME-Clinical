from app.repositories.base import first, rows, table


def list_recent(limit: int = 100) -> list[dict]:
    return rows(table("reports").select("*").order("created_at", desc=True).limit(limit))


def get(report_id: str) -> dict | None:
    return first(table("reports").select("*").eq("id", report_id))


def add(values: dict) -> dict:
    return table("reports").insert(values).execute().data[0]


def all_paths() -> list[str]:
    return [r["file_path"] for r in rows(table("reports").select("*")) if r.get("file_path")]


def update(report_id: str, values: dict) -> None:
    table("reports").update(values).eq("id", report_id).execute()
