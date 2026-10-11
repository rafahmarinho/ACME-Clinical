from app.repositories.base import rows, table, upsert_many


def list_all() -> list[dict]:
    return rows(table("thresholds").select("*"))


def defaults() -> list[dict]:
    return rows(table("thresholds").select("*").is_("patient_id", "null"))


def for_patient(patient_id: str) -> list[dict]:
    return rows(table("thresholds").select("*").eq("patient_id", patient_id))


def save_many(items: list[dict]) -> list[dict]:
    return upsert_many("thresholds", items, on_conflict="patient_id,parameter")


def delete_patient_override(patient_id: str, parameter: str) -> None:
    table("thresholds").delete().eq("patient_id", patient_id).eq("parameter", parameter).execute()
