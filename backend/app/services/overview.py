from app.core.security import CurrentUser
from app.repositories import alarms as alarms_repo
from app.repositories import events as events_repo
from app.repositories import sim_state as sim_repo
from app.services.context import SEVERITY_ORDER, Lookup, alarm_summary

NON_CLINICAL_EVENT_PREFIXES = ("device.", "maintenance.", "simulation.", "integration.", "demo.")


def ward_overview(user: CurrentUser) -> dict:
    lk = Lookup(clinical=user.is_clinical)
    alarms = alarms_repo.active()
    if not user.is_clinical:
        alarms = [a for a in alarms if a["category"] == "technical"]
    by_bed: dict[str, list[dict]] = {}
    for a in alarms:
        if a.get("bed_id"):
            by_bed.setdefault(a["bed_id"], []).append(a)

    wards = []
    for w in sorted(lk.wards.values(), key=lambda w: w["code"]):
        beds = []
        for b in sorted((b for b in lk.beds.values() if b["ward_id"] == w["id"]), key=lambda b: b["label"]):
            patient = lk.patient_by_bed.get(b["id"])
            monitor = lk.monitor_by_bed.get(b["id"])
            bed_alarms = sorted(by_bed.get(b["id"], []), key=lambda a: (SEVERITY_ORDER.get(a["severity"], 9), a.get("acknowledged_at") is not None))
            p = lk.patient_brief(patient["id"]) if patient else None
            if p and user.is_clinical:
                p.update(acuity=patient["acuity"], diagnosis=patient["diagnosis"], code_status=patient["code_status"],
                         isolation=patient.get("isolation"))
            beds.append({
                **lk.bed(b["id"]),
                "position_x": b["position_x"],
                "position_z": b["position_z"],
                "occupied": patient is not None,
                "patient": p,
                "monitor": lk.monitor_live(monitor) if monitor else None,
                "alarms": alarm_summary(bed_alarms),
                "top_alarm": {"id": bed_alarms[0]["id"], "message": bed_alarms[0]["message"], "severity": bed_alarms[0]["severity"],
                              "acknowledged": bool(bed_alarms[0].get("acknowledged_at"))} if bed_alarms else None,
            })
        wards.append({"id": w["id"], "code": w["code"], "name": w["name"], "floor": w.get("floor"), "beds": beds})

    monitors = list(lk.monitors.values())
    in_use = [m for m in monitors if m["status"] == "in_use"]
    events = events_repo.search(limit=40)
    if not user.is_clinical:
        events = [e for e in events if e["kind"].startswith(NON_CLINICAL_EVENT_PREFIXES)]
    return {
        "sim": sim_repo.get(),
        "kpis": {
            "patients": len(lk.patients),
            "beds_total": len(lk.beds),
            "beds_free": len(lk.beds) - len(lk.patient_by_bed),
            "monitored": len(in_use),
            "open_alarms": len(alarms),
            "unacknowledged": sum(1 for a in alarms if not a.get("acknowledged_at")),
            "critical": sum(1 for a in alarms if a["severity"] == "critical"),
            "warning": sum(1 for a in alarms if a["severity"] == "warning"),
            "devices_total": len(monitors),
            "devices_offline": sum(1 for m in in_use if m["connection"] == "lost"),
            "devices_low_battery": sum(1 for m in monitors if m["battery_pct"] <= 20 and m["status"] != "maintenance"),
            "devices_sensor_issue": sum(1 for m in in_use if m["sensor_status"] != "ok"),
            "devices_available": sum(1 for m in monitors if m["status"] == "available"),
            "devices_maintenance": sum(1 for m in monitors if m["status"] == "maintenance"),
        },
        "wards": wards,
        "recent_events": events[:12],
    }


def live_monitors(user: CurrentUser) -> list[dict]:
    """Monitors assigned to beds, with patient, latest vitals and alarm state, for the live wall."""
    lk = Lookup(clinical=user.is_clinical)
    alarms = alarms_repo.active()
    by_monitor: dict[str, list[dict]] = {}
    for a in alarms:
        if a.get("monitor_id"):
            by_monitor.setdefault(a["monitor_id"], []).append(a)
    out = []
    for m in lk.monitors.values():
        if m["status"] != "in_use":
            continue
        patient = lk.patient_by_bed.get(m.get("bed_id"))
        mine = sorted(by_monitor.get(m["id"], []), key=lambda a: (SEVERITY_ORDER.get(a["severity"], 9), a.get("acknowledged_at") is not None))
        out.append({
            **lk.monitor_live(m),
            "patient": lk.patient_brief(patient["id"]) if patient else None,
            "alarms": alarm_summary(mine),
            "open_alarms": [lk.alarm(a) for a in mine],
        })
    return sorted(out, key=lambda r: r["bed"]["display"] if r["bed"] else "")
