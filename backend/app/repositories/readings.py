from app.repositories.base import insert_many, select_all, table


def add_many(items: list[dict]) -> None:
    if items:
        insert_many("readings", items)


def for_patient(patient_id: str, since: str) -> list[dict]:
    return select_all(
        lambda: table("readings").select("*").eq("patient_id", patient_id).gte("recorded_at", since).order("recorded_at")
    )


def for_monitor(monitor_id: str, since: str) -> list[dict]:
    return select_all(
        lambda: table("readings").select("*").eq("monitor_id", monitor_id).gte("recorded_at", since).order("recorded_at")
    )


def in_window(since: str, patient_ids: list[str] | None = None) -> list[dict]:
    def build():
        q = table("readings").select("*").gte("recorded_at", since)
        if patient_ids is not None:
            q = q.in_("patient_id", patient_ids)
        return q.order("id")

    return select_all(build)
