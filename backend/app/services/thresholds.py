from app.core.errors import BadRequest, NotFound
from app.core.security import CurrentUser
from app.repositories import patients as patients_repo
from app.repositories import thresholds as thresholds_repo
from app.services import audit
from app.services.context import Lookup
from app.services.engine import PARAM_INFO, PARAMS
from app.services.patients import effective_thresholds


def validate(t: dict) -> None:
    label = PARAM_INFO[t["parameter"]][0]
    wl, wh, cl, ch = t.get("warn_low"), t.get("warn_high"), t.get("crit_low"), t.get("crit_high")
    if wl is None and wh is None and cl is None and ch is None:
        raise BadRequest(f"{label}: set at least one limit")
    if wl is not None and cl is not None and cl > wl:
        raise BadRequest(f"{label}: the critical low limit must be at or below the warning low limit")
    if wh is not None and ch is not None and ch < wh:
        raise BadRequest(f"{label}: the critical high limit must be at or above the warning high limit")
    if wl is not None and wh is not None and wl >= wh:
        raise BadRequest(f"{label}: the low limit must be below the high limit")


def defaults() -> list[dict]:
    lk = Lookup()
    rows = {r["parameter"]: r for r in thresholds_repo.defaults()}
    out = []
    for p in PARAMS:
        r = rows.get(p, {"parameter": p, "enabled": True})
        out.append({**r, "label": PARAM_INFO[p][0], "unit": PARAM_INFO[p][1], "updated_by_user": lk.person(r.get("updated_by"))})
    return out


def save_defaults(items: list[dict], user: CurrentUser) -> list[dict]:
    for t in items:
        validate(t)
    thresholds_repo.save_many([{**t, "patient_id": None, "updated_by": user.id, "updated_at": audit.sim_clock()[0]} for t in items])
    audit.log("thresholds.defaults", f"{user.full_name} updated ward default alarm limits ({', '.join(PARAM_INFO[t['parameter']][0] for t in items)})",
              actor_id=user.id, data={"thresholds": items})
    return defaults()


def overrides() -> list[dict]:
    lk = Lookup()
    out = []
    for r in thresholds_repo.list_all():
        if r.get("patient_id"):
            out.append({**r, "label": PARAM_INFO[r["parameter"]][0], "unit": PARAM_INFO[r["parameter"]][1],
                        "patient": lk.patient_brief(r["patient_id"]), "bed": lk.bed((lk.patients.get(r["patient_id"]) or {}).get("bed_id")),
                        "updated_by_user": lk.person(r.get("updated_by"))})
    return sorted(out, key=lambda r: ((r["patient"] or {}).get("name") or "", r["parameter"]))


def save_patient(patient_id: str, items: list[dict], user: CurrentUser) -> list[dict]:
    p = patients_repo.get(patient_id)
    if p is None:
        raise NotFound("Patient")
    for t in items:
        validate(t)
    thresholds_repo.save_many([{**t, "patient_id": patient_id, "updated_by": user.id, "updated_at": audit.sim_clock()[0]} for t in items])
    audit.log("thresholds.patient", f"{user.full_name} set patient-specific limits for {p['first_name']} {p['last_name']}",
              actor_id=user.id, entity_type="patient", entity_id=patient_id, data={"thresholds": items})
    return effective_thresholds(patient_id)


def reset_patient(patient_id: str, parameter: str, user: CurrentUser) -> list[dict]:
    p = patients_repo.get(patient_id)
    if p is None:
        raise NotFound("Patient")
    thresholds_repo.delete_patient_override(patient_id, parameter)
    audit.log("thresholds.patient", f"{user.full_name} restored ward default {PARAM_INFO[parameter][0]} limits for {p['first_name']} {p['last_name']}",
              actor_id=user.id, entity_type="patient", entity_id=patient_id)
    return effective_thresholds(patient_id)
