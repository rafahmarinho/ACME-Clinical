"""Report generation: assemble data, render PDF/CSV, store in Supabase Storage."""

import statistics
from datetime import timedelta

from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.security import REPORT_KINDS_BY_ROLE, CurrentUser
from app.repositories import alarms as alarms_repo
from app.repositories import maintenance as maintenance_repo
from app.repositories import notes as notes_repo
from app.repositories import readings as readings_repo
from app.repositories import reports as reports_repo
from app.repositories import storage
from app.services import audit
from app.services.clock import iso, parse, utcnow
from app.services.context import Lookup
from app.services.report_render import render_csv, render_pdf

KIND_TITLES = {
    "shift_summary": "Shift summary",
    "patient_summary": "Patient vitals summary",
    "device_status": "Device status and maintenance",
    "alarm_log": "Alarm log",
}

ALARM_LABELS = {
    "hr_high": "High heart rate", "hr_low": "Low heart rate",
    "spo2_low": "Low SpO₂", "spo2_high": "High SpO₂",
    "rr_high": "High respiratory rate", "rr_low": "Low respiratory rate",
    "sys_high": "High systolic BP", "sys_low": "Low systolic BP",
    "dia_high": "High diastolic BP", "dia_low": "Low diastolic BP",
    "battery_low": "Low battery", "sensor_issue": "Sensor issue", "connection_lost": "Connection lost",
}


def _stats(values: list[float]) -> dict | None:
    if not values:
        return None
    return {"min": min(values), "max": max(values), "avg": round(sum(values) / len(values), 1)}


def _ack_minutes(alarms: list[dict]) -> list[float]:
    out = []
    for a in alarms:
        if a.get("acknowledged_at"):
            out.append(round((parse(a["acknowledged_at"]) - parse(a["started_at"])).total_seconds() / 60, 1))
    return out


def _alarm_rows(alarms: list[dict], lk: Lookup) -> list[dict]:
    rows = []
    for a in alarms:
        bed = lk.bed(a.get("bed_id"))
        patient = lk.patient_brief(a.get("patient_id"))
        ack = lk.person(a.get("acknowledged_by"))
        rows.append({
            "started_at": a["started_at"], "type": ALARM_LABELS.get(a["type"], a["type"]), "severity": a["severity"],
            "category": a["category"], "bed": bed["display"] if bed else "", "patient": patient["name"] if patient else "",
            "monitor": (lk.monitor_brief(a.get("monitor_id")) or {}).get("serial", ""), "message": a["message"],
            "state": "open" if a["condition_active"] else "resolved",
            "acknowledged_by": ack["full_name"] if ack else "", "acknowledged_at": a.get("acknowledged_at") or "",
            "resolved_at": a.get("resolved_at") or "",
        })
    return rows


def _window(hours: float) -> tuple[str, str]:
    sim_time, _ = audit.sim_clock()
    return iso(parse(sim_time) - timedelta(hours=hours)), sim_time


def build_shift_summary(hours: float, ward_id: str | None, lk: Lookup) -> dict:
    since, until = _window(hours)
    ward = lk.wards.get(ward_id) if ward_id else None
    patients = [p for p in lk.patients.values() if not ward_id or (lk.beds.get(p.get("bed_id")) or {}).get("ward_id") == ward_id]
    pids = {p["id"] for p in patients}
    alarms = [a for a in alarms_repo.search(since=since, limit=5000) if not ward_id or a.get("patient_id") in pids]
    readings = readings_repo.in_window(since, list(pids)) if pids else []
    ack = _ack_minutes(alarms)

    by_type: dict[str, int] = {}
    for a in alarms:
        by_type[a["type"]] = by_type.get(a["type"], 0) + 1

    patient_rows = []
    for p in sorted(patients, key=lambda p: (lk.bed(p.get("bed_id")) or {}).get("display", "")):
        rs = [r for r in readings if r["patient_id"] == p["id"]]
        pa = [a for a in alarms if a.get("patient_id") == p["id"] and a["category"] == "clinical"]
        hr, spo2, rr, sys_ = ([r[k] for r in rs if r.get(k) is not None] for k in ("hr", "spo2", "rr", "sys"))
        patient_rows.append({
            "bed": (lk.bed(p.get("bed_id")) or {}).get("display", ""),
            "patient": f"{p['first_name']} {p['last_name']}",
            "acuity": p["acuity"],
            "monitored": bool(rs),
            "hr_avg": _stats(hr)["avg"] if hr else None,
            "spo2_min": min(spo2) if spo2 else None,
            "rr_max": max(rr) if rr else None,
            "sys_range": f"{min(sys_)}–{max(sys_)}" if sys_ else None,
            "clinical_alarms": len(pa),
        })

    return {
        "title": KIND_TITLES["shift_summary"] + (f" · {ward['name']}" if ward else " · All wards"),
        "window": {"since": since, "until": until, "hours": hours},
        "kpis": {
            "alarms_total": len(alarms),
            "critical": sum(1 for a in alarms if a["severity"] == "critical"),
            "warning": sum(1 for a in alarms if a["severity"] == "warning"),
            "clinical": sum(1 for a in alarms if a["category"] == "clinical"),
            "technical": sum(1 for a in alarms if a["category"] == "technical"),
            "still_open": sum(1 for a in alarms if a["condition_active"]),
            "unacknowledged": sum(1 for a in alarms if not a.get("acknowledged_at")),
            "escalations": sum(1 for a in alarms if a.get("escalated_at")),
            "median_ack_minutes": round(statistics.median(ack), 1) if ack else None,
            "patients": len(patients),
            "readings": len(readings),
        },
        "alarms_by_type": sorted(({"type": t, "label": ALARM_LABELS.get(t, t), "count": c} for t, c in by_type.items()),
                                 key=lambda r: -r["count"]),
        "patients": patient_rows,
        "alarms": _alarm_rows(alarms[:200], lk),
    }


def build_patient_summary(patient_id: str, hours: float, lk: Lookup) -> dict:
    p = lk.patients.get(patient_id)
    if p is None:
        raise NotFound("Patient")
    since, until = _window(hours)
    readings = readings_repo.for_patient(patient_id, since)
    alarms = alarms_repo.search(patient_id=patient_id, since=since, limit=500)
    hourly: dict[str, list[dict]] = {}
    for r in readings:
        hourly.setdefault(r["recorded_at"][:13], []).append(r)
    hourly_rows = []
    for hour, rs in sorted(hourly.items()):
        row = {"hour": hour.replace("T", " ") + ":00"}
        for k in ("hr", "spo2", "rr", "sys", "dia"):
            vals = [r[k] for r in rs if r.get(k) is not None]
            row[k] = round(sum(vals) / len(vals)) if vals else None
        hourly_rows.append(row)
    series = [{"t": r["recorded_at"], "hr": r.get("hr"), "spo2": r.get("spo2")} for r in readings]
    bed = lk.bed(p.get("bed_id"))
    att = lk.person(p.get("attending_id"))
    return {
        "title": f"{KIND_TITLES['patient_summary']} · {p['first_name']} {p['last_name']}",
        "window": {"since": since, "until": until, "hours": hours},
        "patient": {
            "name": f"{p['first_name']} {p['last_name']}", "mrn": p["mrn"], "bed": bed["display"] if bed else "",
            "diagnosis": p["diagnosis"], "acuity": p["acuity"], "code_status": p["code_status"],
            "allergies": ", ".join(p.get("allergies") or []) or "None known",
            "attending": att["full_name"] if att else "",
        },
        "stats": {k: _stats([r[k] for r in readings if r.get(k) is not None]) for k in ("hr", "spo2", "rr", "sys", "dia")},
        "kpis": {
            "readings": len(readings),
            "alarms_total": len(alarms),
            "critical": sum(1 for a in alarms if a["severity"] == "critical"),
            "still_open": sum(1 for a in alarms if a["condition_active"]),
            "median_ack_minutes": round(statistics.median(_ack_minutes(alarms)), 1) if _ack_minutes(alarms) else None,
        },
        "hourly": hourly_rows,
        "series": series[:: max(1, len(series) // 240)],
        "alarms": _alarm_rows(alarms, lk),
        "notes": [{"created_at": n["created_at"], "category": n["category"], "body": n["body"],
                   "author": (lk.person(n.get("author_id")) or {}).get("full_name", "")}
                  for n in notes_repo.for_patient(patient_id, limit=30)],
    }


def build_device_status(hours: float, lk: Lookup) -> dict:
    since, until = _window(hours)
    tech_alarms = alarms_repo.search(category="technical", since=since, limit=2000)
    work = maintenance_repo.search(limit=500)
    rows = []
    for m in sorted(lk.monitors.values(), key=lambda m: m["serial"]):
        bed = lk.bed(m.get("bed_id"))
        rows.append({
            "serial": m["serial"], "asset_tag": m["asset_tag"], "model": m["model"], "firmware": m["firmware"],
            "status": m["status"], "bed": bed["display"] if bed else "", "connection": m["connection"],
            "sensor": m["sensor_status"], "battery_pct": round(m["battery_pct"]),
            "next_service_due": m.get("next_service_due") or "",
            "technical_alarms": sum(1 for a in tech_alarms if a.get("monitor_id") == m["id"]),
            "open_work_orders": sum(1 for w in work if w["monitor_id"] == m["id"] and w["status"] in ("scheduled", "in_progress")),
        })
    open_work = [w for w in work if w["status"] in ("scheduled", "in_progress")]
    return {
        "title": KIND_TITLES["device_status"],
        "window": {"since": since, "until": until, "hours": hours},
        "kpis": {
            "devices": len(rows),
            "in_use": sum(1 for r in rows if r["status"] == "in_use"),
            "offline": sum(1 for r in rows if r["connection"] == "lost" and r["status"] == "in_use"),
            "low_battery": sum(1 for r in rows if r["battery_pct"] <= 20),
            "maintenance": sum(1 for r in rows if r["status"] == "maintenance"),
            "technical_alarms": len(tech_alarms),
            "open_work_orders": len(open_work),
        },
        "devices": rows,
        "work_orders": [{"monitor": (lk.monitors.get(w["monitor_id"]) or {}).get("serial", ""), "kind": w["kind"],
                         "status": w["status"], "title": w["title"], "scheduled_for": w.get("scheduled_for") or ""}
                        for w in open_work],
    }


def build_alarm_log(hours: float, lk: Lookup, technical_only: bool) -> dict:
    since, until = _window(hours)
    alarms = alarms_repo.search(since=since, category="technical" if technical_only else None, limit=5000)
    return {
        "title": KIND_TITLES["alarm_log"] + (" · technical alarms" if technical_only else ""),
        "window": {"since": since, "until": until, "hours": hours},
        "kpis": {"alarms_total": len(alarms), "critical": sum(1 for a in alarms if a["severity"] == "critical"),
                 "still_open": sum(1 for a in alarms if a["condition_active"]),
                 "unacknowledged": sum(1 for a in alarms if not a.get("acknowledged_at"))},
        "alarms": _alarm_rows(alarms, lk),
    }


def generate(kind: str, fmt: str, hours: float, patient_id: str | None, ward_id: str | None, user: CurrentUser) -> dict:
    if kind not in REPORT_KINDS_BY_ROLE[user.role]:
        raise Forbidden("Your role cannot generate this report")
    lk = Lookup(clinical=user.is_clinical)
    if kind == "shift_summary":
        data = build_shift_summary(hours, ward_id, lk)
    elif kind == "patient_summary":
        if not patient_id:
            raise BadRequest("Choose a patient for this report")
        data = build_patient_summary(patient_id, hours, lk)
    elif kind == "device_status":
        data = build_device_status(hours, lk)
    else:
        data = build_alarm_log(hours, lk, technical_only=not user.is_clinical)

    data["generated_by"] = user.full_name
    data["generated_at"] = iso(utcnow())
    content, content_type = (render_pdf(kind, data), "application/pdf") if fmt == "pdf" else (render_csv(kind, data), "text/csv")

    report = reports_repo.add({
        "kind": kind, "title": data["title"], "format": fmt,
        "params": {"hours": hours, "patient_id": patient_id, "ward_id": ward_id},
        "summary": data,
        "created_by": user.id,
    })
    path = f"{report['created_at'][:7]}/{report['id']}.{fmt}"
    storage.upload("reports", path, content, content_type)
    reports_repo.update(report["id"], {"file_path": path, "file_size": len(content)})
    audit.log("report.generated", f"{user.full_name} generated “{data['title']}” ({fmt.upper()})",
              actor_id=user.id, entity_type="report", entity_id=report["id"])
    return {**report, "file_path": path, "file_size": len(content), "created_by_user": lk.person(user.id)}


def list_reports(user: CurrentUser) -> list[dict]:
    lk = Lookup(clinical=user.is_clinical)
    allowed = REPORT_KINDS_BY_ROLE[user.role]
    out = []
    for r in reports_repo.list_recent():
        if r["kind"] not in allowed:
            continue
        out.append({**{k: v for k, v in r.items() if k != "summary"}, "kpis": (r.get("summary") or {}).get("kpis"),
                    "created_by_user": lk.person(r.get("created_by"))})
    return out


def get_report(report_id: str, user: CurrentUser) -> dict:
    r = reports_repo.get(report_id)
    if r is None or r["kind"] not in REPORT_KINDS_BY_ROLE[user.role]:
        raise NotFound("Report")
    return {**r, "created_by_user": Lookup(clinical=user.is_clinical).person(r.get("created_by"))}


def download_url(report_id: str, user: CurrentUser) -> dict:
    r = get_report(report_id, user)
    if not r.get("file_path"):
        raise NotFound("Report file")
    return {"url": storage.signed_url("reports", r["file_path"], 600), "expires_in": 600}


def email_report(report_id: str, recipient: str, user: CurrentUser) -> dict:
    r = get_report(report_id, user)
    delivered = audit.send_message("email", recipient, f"ACME Clinical report: {r['title']}",
                                   f"{user.full_name} shared the report “{r['title']}” ({r['format'].upper()}). "
                                   "A secure download link is included (simulated email gateway).", "report", report_id)
    if not delivered:
        raise BadRequest("The email integration is disabled in system settings")
    audit.log("report.emailed", f"{user.full_name} emailed “{r['title']}” to {recipient}", actor_id=user.id,
              entity_type="report", entity_id=report_id)
    return {"ok": True}
