from datetime import timedelta

from app.core.errors import BadRequest, NotFound
from app.core.security import CurrentUser
from app.repositories import alarms as alarms_repo
from app.repositories import notes as notes_repo
from app.repositories import patients as patients_repo
from app.repositories import readings as readings_repo
from app.repositories import thresholds as thresholds_repo
from app.services import audit
from app.services.clock import iso, parse
from app.services.context import Lookup, age_from, alarm_summary
from app.services.engine import PARAMS, ThresholdBook


def _present(p: dict, lk: Lookup, alarms_by_patient: dict[str, list[dict]]) -> dict:
    bed = lk.bed(p.get("bed_id"))
    monitor = lk.monitor_by_bed.get(p.get("bed_id")) if p.get("bed_id") else None
    return {
        "id": p["id"],
        "mrn": p["mrn"],
        "first_name": p["first_name"],
        "last_name": p["last_name"],
        "name": f"{p['first_name']} {p['last_name']}",
        "sex": p["sex"],
        "age": age_from(p.get("date_of_birth")),
        "date_of_birth": p.get("date_of_birth"),
        "diagnosis": p["diagnosis"],
        "acuity": p["acuity"],
        "allergies": p.get("allergies") or [],
        "code_status": p["code_status"],
        "isolation": p.get("isolation"),
        "status": p["status"],
        "admitted_at": p["admitted_at"],
        "bed": bed,
        "attending": lk.person(p.get("attending_id")),
        "primary_nurse": lk.person(p.get("primary_nurse_id")),
        "monitor": lk.monitor_live(monitor) if monitor else None,
        "alarms": alarm_summary(alarms_by_patient.get(p["id"], [])),
    }


def _open_alarms_by_patient() -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for a in alarms_repo.active():
        if a.get("patient_id"):
            out.setdefault(a["patient_id"], []).append(a)
    return out


def list_patients(*, q: str | None, ward_id: str | None, acuity: int | None, monitored: str | None,
                  alarm: str | None, sort: str) -> list[dict]:
    lk = Lookup()
    by_patient = _open_alarms_by_patient()
    rows = [_present(p, lk, by_patient) for p in lk.patients.values()]
    if q:
        needle = q.lower().strip()
        rows = [r for r in rows if needle in r["name"].lower() or needle in r["mrn"].lower()
                or needle in r["diagnosis"].lower() or (r["bed"] and needle in r["bed"]["display"].lower())]
    if ward_id:
        rows = [r for r in rows if r["bed"] and r["bed"]["ward_id"] == ward_id]
    if acuity:
        rows = [r for r in rows if r["acuity"] == acuity]
    if monitored == "yes":
        rows = [r for r in rows if r["monitor"]]
    elif monitored == "no":
        rows = [r for r in rows if not r["monitor"]]
    if alarm == "any":
        rows = [r for r in rows if r["alarms"]["count"]]
    elif alarm in ("critical", "warning"):
        rows = [r for r in rows if r["alarms"]["highest"] == alarm]
    sev = {"critical": 0, "warning": 1, None: 2}
    if sort == "acuity":
        rows.sort(key=lambda r: (-r["acuity"], r["last_name"]))
    elif sort == "alarms":
        rows.sort(key=lambda r: (sev.get(r["alarms"]["highest"], 2), -r["alarms"]["count"], r["last_name"]))
    elif sort == "bed":
        rows.sort(key=lambda r: r["bed"]["display"] if r["bed"] else "ZZZ")
    else:
        rows.sort(key=lambda r: (r["last_name"], r["first_name"]))
    return rows


def effective_thresholds(patient_id: str) -> list[dict]:
    rows = thresholds_repo.list_all()
    book = ThresholdBook(rows)
    out = []
    for p in PARAMS:
        override = book.overrides.get((patient_id, p))
        th = override or book.defaults.get(p) or {}
        out.append({
            "parameter": p,
            "warn_low": th.get("warn_low"), "warn_high": th.get("warn_high"),
            "crit_low": th.get("crit_low"), "crit_high": th.get("crit_high"),
            "enabled": th.get("enabled", True),
            "source": "patient" if override else "default",
            "updated_at": th.get("updated_at"),
        })
    return out


def get_patient(patient_id: str) -> dict:
    lk = Lookup()
    p = lk.patients.get(patient_id) or patients_repo.get(patient_id)
    if p is None:
        raise NotFound("Patient")
    data = _present(p, lk, _open_alarms_by_patient())
    data["baseline"] = p.get("baseline") or {}
    data["thresholds"] = effective_thresholds(patient_id)
    data["open_alarms"] = [lk.alarm(a) for a in alarms_repo.search(status="open", patient_id=patient_id, limit=50)]
    return data


def update_patient(patient_id: str, values: dict, user: CurrentUser) -> dict:
    if patients_repo.get(patient_id) is None:
        raise NotFound("Patient")
    if not values:
        raise BadRequest("Nothing to update")
    patients_repo.update(patient_id, values)
    audit.log("patient.updated", f"{user.full_name} updated {', '.join(values)} for patient record",
              actor_id=user.id, entity_type="patient", entity_id=patient_id)
    return get_patient(patient_id)


def readings(patient_id: str, hours: float) -> dict:
    sim_time, _ = audit.sim_clock()
    since = parse(sim_time) - timedelta(hours=hours)
    rows = readings_repo.for_patient(patient_id, iso(since))
    # Downsample to at most ~360 points by averaging buckets.
    step = max(1, len(rows) // 360)
    points = []
    for i in range(0, len(rows), step):
        chunk = rows[i : i + step]
        point = {"t": chunk[-1]["recorded_at"]}
        for k in ("hr", "spo2", "rr", "sys", "dia", "map"):
            vals = [r[k] for r in chunk if r.get(k) is not None]
            point[k] = round(sum(vals) / len(vals), 1) if vals else None
        points.append(point)
    stats = {}
    for k in ("hr", "spo2", "rr", "sys", "dia"):
        vals = [r[k] for r in rows if r.get(k) is not None]
        stats[k] = {"min": min(vals), "max": max(vals), "avg": round(sum(vals) / len(vals), 1)} if vals else None
    return {"since": iso(since), "until": sim_time, "points": points, "stats": stats, "count": len(rows)}


def list_notes(patient_id: str) -> list[dict]:
    lk = Lookup()
    return [{**n, "author": lk.person(n.get("author_id"))} for n in notes_repo.for_patient(patient_id)]


def add_note(patient_id: str, category: str, body: str, user: CurrentUser) -> dict:
    p = patients_repo.get(patient_id)
    if p is None:
        raise NotFound("Patient")
    note = notes_repo.add({"patient_id": patient_id, "author_id": user.id, "category": category, "body": body.strip()})
    audit.log("note.added", f"{user.full_name} added a {category} note for {p['first_name']} {p['last_name']}",
              actor_id=user.id, entity_type="patient", entity_id=patient_id)
    return {**note, "author": Lookup().person(user.id)}


def patient_alarms(patient_id: str, limit: int = 100) -> list[dict]:
    lk = Lookup()
    return [lk.alarm(a) for a in alarms_repo.search(status="all", patient_id=patient_id, limit=limit)]
