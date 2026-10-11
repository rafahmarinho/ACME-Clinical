"""Monitors: assignment to beds, maintenance mode, battery swaps."""

from datetime import date

from app.core.errors import BadRequest, NotFound
from app.core.security import CurrentUser
from app.repositories import alarms as alarms_repo
from app.repositories import maintenance as maintenance_repo
from app.repositories import monitors as monitors_repo
from app.services import audit
from app.services.clock import iso, utcnow
from app.services.context import Lookup, alarm_summary


def _alarms_by_monitor() -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for a in alarms_repo.active():
        if a.get("monitor_id"):
            out.setdefault(a["monitor_id"], []).append(a)
    return out


def _present(m: dict, lk: Lookup, alarms: dict[str, list[dict]], open_work: dict[str, int]) -> dict:
    data = lk.monitor_live(m)
    data["patient"] = lk.patient_brief((lk.patient_by_bed.get(m.get("bed_id")) or {}).get("id"))
    data["alarms"] = alarm_summary(alarms.get(m["id"], []))
    data["open_work_orders"] = open_work.get(m["id"], 0)
    due = m.get("next_service_due")
    data["service_overdue"] = bool(due and date.fromisoformat(str(due)[:10]) < date.today())
    return data


def list_monitors(user: CurrentUser, *, q: str | None, status: str | None, connection: str | None,
                  battery: str | None, issue: str | None) -> list[dict]:
    lk = Lookup(clinical=user.is_clinical)
    alarms = _alarms_by_monitor()
    open_work: dict[str, int] = {}
    for r in maintenance_repo.search(limit=500):
        if r["status"] in ("scheduled", "in_progress"):
            open_work[r["monitor_id"]] = open_work.get(r["monitor_id"], 0) + 1
    rows = [_present(m, lk, alarms, open_work) for m in lk.monitors.values()]
    if q:
        needle = q.lower().strip()
        rows = [r for r in rows if needle in r["serial"].lower() or needle in r["asset_tag"].lower()
                or needle in r["model"].lower() or (r["bed"] and needle in r["bed"]["display"].lower())
                or (r["patient"] and r["patient"]["name"] and needle in r["patient"]["name"].lower())]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if connection:
        rows = [r for r in rows if r["connection"] == connection]
    if battery == "low":
        rows = [r for r in rows if r["battery_pct"] <= 20]
    if issue == "any":
        rows = [r for r in rows if r["connection"] == "lost" or r["sensor_status"] != "ok" or r["battery_pct"] <= 20 or r["service_overdue"]]
    return sorted(rows, key=lambda r: r["serial"])


def get_monitor(monitor_id: str, user: CurrentUser) -> dict:
    lk = Lookup(clinical=user.is_clinical)
    m = lk.monitors.get(monitor_id)
    if m is None:
        raise NotFound("Monitor")
    work = maintenance_repo.search(monitor_id=monitor_id)
    data = _present(m, lk, _alarms_by_monitor(), {monitor_id: sum(1 for r in work if r["status"] in ("scheduled", "in_progress"))})
    data["assignments"] = [
        {**a, "bed": lk.bed(a.get("bed_id")), "patient": lk.patient_brief(a.get("patient_id")) if a.get("patient_id") in lk.patients else None,
         "assigned_by_user": lk.person(a.get("assigned_by")), "unassigned_by_user": lk.person(a.get("unassigned_by"))}
        for a in monitors_repo.assignments(monitor_id)
    ]
    data["maintenance"] = [{**r, "technician": lk.person(r.get("technician_id"))} for r in work]
    data["recent_alarms"] = [lk.alarm(a) for a in alarms_repo.search(monitor_id=monitor_id, category="technical", limit=20)]
    return data


def available_beds() -> list[dict]:
    """Beds with an admitted patient and no monitor."""
    lk = Lookup()
    out = []
    for bed_id, patient in lk.patient_by_bed.items():
        if bed_id not in lk.monitor_by_bed:
            out.append({"bed": lk.bed(bed_id), "patient": lk.patient_brief(patient["id"])})
    return sorted(out, key=lambda r: r["bed"]["display"])


def _resolve_monitor_alarms(monitor_id: str, reason: str) -> int:
    sim_time, _ = audit.sim_clock()
    open_alarms = alarms_repo.search(status="open", monitor_id=monitor_id, limit=100)
    for a in open_alarms:
        alarms_repo.update(a["id"], {"condition_active": False, "resolved_at": sim_time, "resolution": reason})
    return len(open_alarms)


def assign(monitor_id: str, bed_id: str, user: CurrentUser) -> dict:
    lk = Lookup()
    m = lk.monitors.get(monitor_id)
    if m is None:
        raise NotFound("Monitor")
    if m["status"] == "maintenance":
        raise BadRequest("This monitor is in maintenance and cannot be assigned")
    if m.get("bed_id"):
        raise BadRequest(f"{m['serial']} is already assigned to {lk.bed(m['bed_id'])['display']}. Unassign it first.")
    bed = lk.bed(bed_id)
    if bed is None:
        raise NotFound("Bed")
    patient = lk.patient_by_bed.get(bed_id)
    if patient is None:
        raise BadRequest(f"Bed {bed['display']} has no admitted patient")
    if bed_id in lk.monitor_by_bed:
        raise BadRequest(f"Bed {bed['display']} already has monitor {lk.monitor_by_bed[bed_id]['serial']}")

    sim_time, _ = audit.sim_clock()
    monitors_repo.update(monitor_id, {
        "bed_id": bed_id, "status": "in_use", "fault": "none", "fault_started_tick": None, "latest": {},
        "connection": "connected" if m["battery_pct"] > 0 else "lost", "sensor_status": "ok",
    })
    monitors_repo.add_assignment({"monitor_id": monitor_id, "bed_id": bed_id, "patient_id": patient["id"],
                                  "assigned_by": user.id, "assigned_at": sim_time})
    audit.log("device.assigned", f"{user.full_name} assigned {m['serial']} to bed {bed['display']}",
              actor_id=user.id, entity_type="monitor", entity_id=monitor_id, data={"bed": bed["display"]})
    return get_monitor(monitor_id, user)


def unassign(monitor_id: str, user: CurrentUser, reason: str = "Monitoring discontinued") -> dict:
    m = monitors_repo.get(monitor_id)
    if m is None:
        raise NotFound("Monitor")
    if not m.get("bed_id"):
        raise BadRequest("This monitor is not assigned to a bed")
    bed = Lookup().bed(m["bed_id"])
    sim_time, _ = audit.sim_clock()
    resolved = _resolve_monitor_alarms(monitor_id, reason)
    open_assignment = monitors_repo.open_assignment(monitor_id)
    if open_assignment:
        monitors_repo.close_assignment(open_assignment["id"], {"unassigned_at": sim_time, "unassigned_by": user.id})
    monitors_repo.update(monitor_id, {"bed_id": None, "status": "available", "fault": "none", "fault_started_tick": None,
                                      "latest": {}, "sensor_status": "ok"})
    audit.log("device.unassigned", f"{user.full_name} removed {m['serial']} from bed {bed['display'] if bed else '?'}"
              + (f" · {resolved} open alarm(s) closed" if resolved else ""),
              actor_id=user.id, entity_type="monitor", entity_id=monitor_id)
    return get_monitor(monitor_id, user)


def set_maintenance(monitor_id: str, enabled: bool, user: CurrentUser) -> dict:
    m = monitors_repo.get(monitor_id)
    if m is None:
        raise NotFound("Monitor")
    if enabled:
        if m["status"] == "maintenance":
            raise BadRequest("Monitor is already in maintenance")
        if m.get("bed_id"):
            unassign(monitor_id, user, reason="Monitor taken out of service")
        _resolve_monitor_alarms(monitor_id, "Monitor taken out of service")
        monitors_repo.update(monitor_id, {"status": "maintenance", "signal_quality": 0, "fault": "none"})
        audit.log("device.maintenance", f"{user.full_name} took {m['serial']} out of service for maintenance",
                  actor_id=user.id, entity_type="monitor", entity_id=monitor_id, severity="warning")
    else:
        if m["status"] != "maintenance":
            raise BadRequest("Monitor is not in maintenance")
        monitors_repo.update(monitor_id, {"status": "available", "connection": "connected", "sensor_status": "ok", "signal_quality": 100})
        audit.log("device.in_service", f"{user.full_name} returned {m['serial']} to service",
                  actor_id=user.id, entity_type="monitor", entity_id=monitor_id)
    return get_monitor(monitor_id, user)


def replace_battery(monitor_id: str, user: CurrentUser) -> dict:
    m = monitors_repo.get(monitor_id)
    if m is None:
        raise NotFound("Monitor")
    values = {"battery_pct": 100}
    if m.get("fault") == "low_battery":
        values.update(fault="none", fault_started_tick=None)
    monitors_repo.update(monitor_id, values)
    maintenance_repo.add({
        "monitor_id": monitor_id, "kind": "battery_replacement", "status": "completed",
        "title": "Battery pack swapped", "details": f"Battery at {m['battery_pct']:.0f}% before swap.",
        "resolution": "Fresh battery installed. Capacity 100%.", "scheduled_for": date.today().isoformat(),
        "completed_at": iso(utcnow()), "technician_id": user.id, "created_by": user.id,
    })
    audit.log("device.battery_replaced", f"{user.full_name} replaced the battery of {m['serial']} ({m['battery_pct']:.0f}% → 100%)",
              actor_id=user.id, entity_type="monitor", entity_id=monitor_id)
    return get_monitor(monitor_id, user)
