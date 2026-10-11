from app.core.security import CurrentUser
from app.services.context import Lookup


def global_search(q: str, user: CurrentUser) -> dict:
    needle = q.lower().strip()
    if len(needle) < 2:
        return {"patients": [], "monitors": [], "staff": []}
    lk = Lookup(clinical=user.is_clinical)

    patients = []
    if user.is_clinical:
        for p in lk.patients.values():
            name = f"{p['first_name']} {p['last_name']}"
            bed = lk.bed(p.get("bed_id"))
            if needle in name.lower() or needle in p["mrn"].lower() or (bed and needle in bed["display"].lower()):
                patients.append({"id": p["id"], "name": name, "mrn": p["mrn"], "bed": bed["display"] if bed else None,
                                 "diagnosis": p["diagnosis"]})

    monitors = []
    for m in lk.monitors.values():
        bed = lk.bed(m.get("bed_id"))
        if needle in m["serial"].lower() or needle in m["asset_tag"].lower() or (bed and needle in bed["display"].lower()):
            monitors.append({"id": m["id"], "serial": m["serial"], "asset_tag": m["asset_tag"], "model": m["model"],
                             "status": m["status"], "bed": bed["display"] if bed else None})

    staff = [
        {"id": p["id"], "full_name": p["full_name"], "role": p["role"], "title": p.get("title")}
        for p in lk.profiles.values()
        if p.get("is_active", True) and (needle in p["full_name"].lower() or needle in (p.get("email") or "").lower())
    ]
    return {"patients": patients[:8], "monitors": monitors[:8], "staff": staff[:6]}
