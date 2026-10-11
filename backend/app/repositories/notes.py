from app.repositories.base import rows, table


def for_patient(patient_id: str, limit: int = 100) -> list[dict]:
    return rows(table("notes").select("*").eq("patient_id", patient_id).order("created_at", desc=True).limit(limit))


def add(values: dict) -> dict:
    return table("notes").insert(values).execute().data[0]
