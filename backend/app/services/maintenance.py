from datetime import date, timedelta

from app.core.errors import BadRequest, NotFound
from app.core.security import CurrentUser
from app.repositories import maintenance as maintenance_repo
from app.repositories import monitors as monitors_repo
from app.services import audit
from app.services.clock import iso, utcnow
from app.services.context import Lookup

KIND_LABELS = {
    "preventive": "Preventive maintenance",
    "repair": "Repair",
    "battery_replacement": "Battery replacement",
    "calibration": "Calibration",
    "inspection": "Inspection",
}


def _present(r: dict, lk: Lookup) -> dict:
    m = lk.monitors.get(r["monitor_id"]) or {}
    overdue = r["status"] in ("scheduled", "in_progress") and r.get("scheduled_for") and date.fromisoformat(str(r["scheduled_for"])[:10]) < date.today()
    return {**r, "kind_label": KIND_LABELS.get(r["kind"], r["kind"]), "overdue": bool(overdue),
            "monitor": {"id": m.get("id"), "serial": m.get("serial"), "model": m.get("model"), "status": m.get("status")},
            "technician": lk.person(r.get("technician_id")), "created_by_user": lk.person(r.get("created_by"))}


def list_records(status: str | None, monitor_id: str | None, q: str | None) -> list[dict]:
    lk = Lookup(clinical=False)
    rows = [_present(r, lk) for r in maintenance_repo.search(status=status, monitor_id=monitor_id)]
    if q:
        needle = q.lower()
        rows = [r for r in rows if needle in r["title"].lower() or needle in (r["monitor"]["serial"] or "").lower()]
    return rows


def create(values: dict, user: CurrentUser) -> dict:
    m = monitors_repo.get(values["monitor_id"])
    if m is None:
        raise NotFound("Monitor")
    record = maintenance_repo.add({**values, "created_by": user.id, "technician_id": values.get("technician_id") or user.id,
                                   "completed_at": iso(utcnow()) if values.get("status") == "completed" else None})
    audit.log("maintenance.created", f"{user.full_name} logged {KIND_LABELS[values['kind']].lower()} for {m['serial']}: {values['title']}",
              actor_id=user.id, entity_type="monitor", entity_id=m["id"])
    return _present(record, Lookup(clinical=False))


def update(record_id: str, values: dict, user: CurrentUser) -> dict:
    r = maintenance_repo.get(record_id)
    if r is None:
        raise NotFound("Maintenance record")
    if not values:
        raise BadRequest("Nothing to update")
    if values.get("status") == "completed" and r["status"] != "completed":
        values["completed_at"] = iso(utcnow())
        m = monitors_repo.get(r["monitor_id"])
        if m and r["kind"] in ("preventive", "calibration", "inspection"):
            today = date.today()
            monitors_repo.update(m["id"], {"last_service_at": today.isoformat(),
                                           "next_service_due": (today + timedelta(days=365)).isoformat()})
    updated = maintenance_repo.update(record_id, values)
    m = monitors_repo.get(r["monitor_id"]) or {}
    audit.log("maintenance.updated", f"{user.full_name} updated work order “{r['title']}” on {m.get('serial', '?')}"
              + (f" → {values['status'].replace('_', ' ')}" if "status" in values else ""),
              actor_id=user.id, entity_type="monitor", entity_id=r["monitor_id"])
    return _present(updated, Lookup(clinical=False))
