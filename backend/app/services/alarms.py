from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.security import CurrentUser, can_acknowledge
from app.repositories import alarms as alarms_repo
from app.repositories import notes as notes_repo
from app.services import audit
from app.services.context import Lookup


def list_alarms(user: CurrentUser, *, status: str, severity: str | None, category: str | None, ward_id: str | None,
                q: str | None, patient_id: str | None, monitor_id: str | None, limit: int) -> list[dict]:
    if not user.is_clinical:
        category = "technical"  # biomedical technicians work device alarms only
    rows = alarms_repo.search(status=status, severity=severity, category=category, patient_id=patient_id,
                              monitor_id=monitor_id, limit=limit)
    lk = Lookup(clinical=user.is_clinical)
    out = [lk.alarm(a) for a in rows]
    if ward_id:
        out = [a for a in out if a["bed"] and a["bed"]["ward_id"] == ward_id]
    if q:
        needle = q.lower().strip()
        out = [
            a for a in out
            if needle in a["message"].lower()
            or (a["patient"] and needle in (a["patient"]["name"] or "").lower())
            or (a["monitor"] and needle in a["monitor"]["serial"].lower())
            or (a["bed"] and needle in a["bed"]["display"].lower())
        ]
    return out


def summary(user: CurrentUser) -> dict:
    rows = alarms_repo.active()
    if not user.is_clinical:
        rows = [a for a in rows if a["category"] == "technical"]
    return {
        "open": len(rows),
        "unacknowledged": sum(1 for a in rows if not a.get("acknowledged_at")),
        "critical": sum(1 for a in rows if a["severity"] == "critical"),
        "warning": sum(1 for a in rows if a["severity"] == "warning"),
        "critical_unacknowledged": sum(1 for a in rows if a["severity"] == "critical" and not a.get("acknowledged_at")),
        "technical": sum(1 for a in rows if a["category"] == "technical"),
        "clinical": sum(1 for a in rows if a["category"] == "clinical"),
    }


def acknowledge(alarm_id: str, user: CurrentUser, note: str | None) -> dict:
    alarm = alarms_repo.get(alarm_id)
    if alarm is None:
        raise NotFound("Alarm")
    if not can_acknowledge(user.role, alarm["category"]):
        raise Forbidden("Your role cannot acknowledge clinical alarms")
    if alarm.get("acknowledged_at"):
        raise BadRequest("This alarm has already been acknowledged")

    sim_time, _ = audit.sim_clock()
    # Acknowledging records who responded. It deliberately leaves condition_active
    # untouched: only the monitoring engine can close an alarm once the condition stops.
    updated = alarms_repo.update(alarm_id, {
        "acknowledged_at": sim_time,
        "acknowledged_by": user.id,
        "ack_note": (note or "").strip() or None,
    })
    still = "condition still active" if alarm["condition_active"] else "condition already resolved"
    audit.log("alarm.acknowledged", f"{user.full_name} acknowledged: {alarm['message']} ({still})",
              actor_id=user.id, entity_type="alarm", entity_id=alarm_id, data={"type": alarm["type"]})
    if note and note.strip() and alarm.get("patient_id") and user.is_clinical:
        notes_repo.add({"patient_id": alarm["patient_id"], "author_id": user.id, "category": "alarm",
                        "body": f"Alarm acknowledged — {alarm['message']}. {note.strip()}"})
    return Lookup(clinical=user.is_clinical).alarm(updated)
