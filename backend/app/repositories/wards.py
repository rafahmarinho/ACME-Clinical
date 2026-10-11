from app.repositories.base import first, rows, table


def list_wards() -> list[dict]:
    return rows(table("wards").select("*").order("code"))


def list_beds() -> list[dict]:
    return rows(table("beds").select("*").order("label"))


def get_bed(bed_id: str) -> dict | None:
    return first(table("beds").select("*").eq("id", bed_id))
