"""Demo data loader. Used by the seed script and by "Reset demo data"."""

from datetime import date, timedelta

from app.db.client import get_db
from app.repositories import maintenance as maintenance_repo
from app.repositories import monitors as monitors_repo
from app.repositories import notes as notes_repo
from app.repositories import profiles as profiles_repo
from app.repositories import reports as reports_repo
from app.repositories import settings as settings_repo
from app.repositories import sim_state as sim_repo
from app.repositories import storage
from app.repositories import thresholds as thresholds_repo
from app.repositories.base import insert_many
from app.services import audit
from app.services import seed_data as sd
from app.services.clock import iso, utcnow
from app.services.simulation import build_engine, persist


def _profile_ids() -> dict[str, str]:
    """Map the local part of each demo email (e.g. 'nurse') to its profile id."""
    out = {}
    for p in profiles_repo.list_all():
        email = p.get("email") or ""
        if email.endswith("@" + sd.DOMAIN):
            out[email.split("@")[0]] = p["id"]
    return out


def reset(actor_id: str | None = None) -> dict:
    # Remove generated report files before the rows that reference them disappear.
    try:
        storage.remove("reports", reports_repo.all_paths())
    except Exception:
        pass  # storage cleanup is best effort

    get_db().rpc("acme_reset_demo", {}).execute()

    today = date.today()
    now = utcnow()
    people = _profile_ids()

    insert_many("wards", [{"id": sd.ward_id(w["code"]), **w} for w in sd.WARDS])
    insert_many("beds", [
        {"id": sd.bed_id(code, label), "ward_id": sd.ward_id(code), "label": label, "position_x": x, "position_z": z}
        for code, layout in sd.BED_LAYOUT.items() for label, x, z in layout
    ])

    patients = []
    serial_to_bed = {}
    for (mrn, first, last, sex, age, ward, bed, dx, acuity, allergies, code, iso_, base, att, nurse, serial, days) in sd.PATIENTS:
        patients.append({
            "id": sd.patient_id(mrn), "mrn": mrn, "first_name": first, "last_name": last, "sex": sex,
            "date_of_birth": sd.dob_for_age(age, today).isoformat(), "bed_id": sd.bed_id(ward, bed),
            "attending_id": people.get(att), "primary_nurse_id": people.get(nurse), "diagnosis": dx,
            "acuity": acuity, "allergies": allergies, "code_status": code, "isolation": iso_,
            "baseline": dict(zip(("hr", "spo2", "rr", "sys", "dia"), base)), "status": "admitted",
            "admitted_at": iso(now - timedelta(days=days, hours=(age % 9))),
        })
        if serial:
            serial_to_bed[serial] = (sd.bed_id(ward, bed), sd.patient_id(mrn), days)
    insert_many("patients", patients)

    monitors = []
    assignments = []
    for serial, model, fw, battery, tag, status, last_days, next_days in sd.MONITORS:
        last_service, next_due = sd.service_dates(today, last_days, next_days)
        bed = serial_to_bed.get(serial)
        monitors.append({
            "id": sd.monitor_id(serial), "serial": serial, "asset_tag": tag, "model": model, "firmware": fw,
            "bed_id": bed[0] if bed else None, "status": status, "connection": "connected", "sensor_status": "ok",
            "battery_pct": battery, "signal_quality": 98 if status != "maintenance" else 0, "fault": "none",
            "fault_started_tick": None, "latest": {}, "last_seen_at": None,
            "last_service_at": last_service, "next_service_due": next_due,
        })
        if bed:
            assignments.append({
                "monitor_id": sd.monitor_id(serial), "bed_id": bed[0], "patient_id": bed[1],
                "assigned_by": people.get("nurse"), "assigned_at": iso(now - timedelta(days=bed[2])),
            })
    insert_many("monitors", monitors)
    insert_many("monitor_assignments", assignments)

    thresholds_repo.save_many(
        [{"patient_id": None, "parameter": p, "warn_low": wl, "warn_high": wh, "crit_low": cl, "crit_high": ch, "enabled": True}
         for p, wl, wh, cl, ch in sd.DEFAULT_THRESHOLDS]
    )
    thresholds_repo.save_many(
        [{"patient_id": sd.patient_id(mrn), "parameter": p, "warn_low": wl, "warn_high": wh, "crit_low": cl,
          "crit_high": ch, "enabled": True, "updated_by": people.get("physician")}
         for mrn, p, wl, wh, cl, ch in sd.PATIENT_THRESHOLDS]
    )
    settings_repo.save(sd.DEFAULT_SETTINGS, actor_id)

    tech = people.get("biomed")
    seed_maintenance = [
        ("VX5-1010", "repair", "in_progress", "Display flicker — replace front bezel and LCD ribbon cable",
         "Reported by 4W night shift: intermittent screen flicker when tilted.", None, -2),
        ("VX5-1007", "preventive", "scheduled", "Annual preventive maintenance and electrical safety test",
         "Service interval exceeded — schedule with charge nurse.", None, -20),
        ("VX5-1004", "calibration", "scheduled", "NIBP module calibration check",
         "Firmware 5.1.8 — update to 5.2.1 during the visit.", None, 10),
        ("VX5-1002", "battery_replacement", "completed", "Battery pack replaced",
         "Battery held < 2 h charge.", "Installed new Li-ion pack, capacity test passed (6 h 10 min).", -95),
        ("VX5-1005", "inspection", "completed", "Post-drop inspection",
         "Monitor fell from IV pole during transport.", "No damage found. Housing and mount checked, functional test passed.", -30),
    ]
    for serial, kind, status, title, details, resolution, offset in seed_maintenance:
        when = today + timedelta(days=offset)
        maintenance_repo.add({
            "monitor_id": sd.monitor_id(serial), "kind": kind, "status": status, "title": title, "details": details,
            "resolution": resolution, "scheduled_for": when.isoformat(), "technician_id": tech, "created_by": tech,
            "completed_at": iso(now + timedelta(days=offset)) if status == "completed" else None,
        })

    for i, (mrn, author, category, body) in enumerate(sd.SAMPLE_NOTES):
        notes_repo.add({
            "patient_id": sd.patient_id(mrn), "author_id": people.get(author), "category": category, "body": body,
            "created_at": iso(now - timedelta(hours=10 - i, minutes=17 * i)),
        })

    # Simulation clock starts two hours in the past and is replayed up to "now".
    start = now - timedelta(minutes=sd.WARMUP_TICKS)
    state = sim_repo.save({
        "tick": 0, "sim_time": iso(start), "scenario": "normal", "auto_run": False, "tick_seconds": 60,
        "seed": 2026, "last_tick_at": None,
    })
    nurse = next((p for p in profiles_repo.list_all() if p["id"] == people.get("nurse")), None)
    responder = {"id": nurse["id"], "full_name": nurse["full_name"]} if nurse else None
    result = build_engine(state).run(sd.WARMUP_TICKS, schedule=sd.WARMUP_SCHEDULE, responder=responder)

    for m in result.monitors.values():
        m["fault"] = "none"
        m["fault_started_tick"] = None
    persist(result)
    sim_repo.update({"tick": result.tick, "sim_time": iso(result.sim_time), "last_tick_at": iso(utcnow())})

    audit.log("demo.reset", "Demo data reset: 12 patients, 10 monitors and two hours of simulated history",
              actor_id=actor_id, severity="warning")
    return {"tick": result.tick, "sim_time": iso(result.sim_time), "patients": len(patients), "monitors": len(monitors),
            "readings": len(result.readings), "alarms": len(result.alarms)}
