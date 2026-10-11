from app.repositories.base import first, rows, table


def list_all(include_discharged: bool = False) -> list[dict]:
    q = table("patients").select("*").order("last_name")
    if not include_discharged:
        q = q.eq("status", "admitted")
    return rows(q)


def get(patient_id: str) -> dict | None:
    return first(table("patients").select("*").eq("id", patient_id))


def update(patient_id: str, values: dict) -> dict | None:
    data = table("patients").update(values).eq("id", patient_id).execute().data
    return data[0] if data else None
