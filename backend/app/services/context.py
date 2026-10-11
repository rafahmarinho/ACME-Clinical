"""Request-scoped lookups and presenters.

The demo dataset is small, so related records are joined in Python. Patient
identity is masked for roles without clinical access (biomedical technicians).
"""

from datetime import date
from functools import cached_property

from app.repositories import monitors as monitors_repo
from app.repositories import patients as patients_repo
from app.repositories import profiles as profiles_repo
from app.repositories import wards as wards_repo
from app.repositories.base import by_id

SEVERITY_ORDER = {"critical": 0, "warning": 1, "advisory": 2}


def age_from(dob: str | None) -> int | None:
    if not dob:
        return None
    d = date.fromisoformat(str(dob)[:10])
    today = date.today()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


class Lookup:
    def __init__(self, clinical: bool = True):
        self.clinical = clinical

    @cached_property
    def wards(self) -> dict[str, dict]:
        return by_id(wards_repo.list_wards())

    @cached_property
    def beds(self) -> dict[str, dict]:
        return by_id(wards_repo.list_beds())

    @cached_property
    def monitors(self) -> dict[str, dict]:
        return by_id(monitors_repo.list_all())

    @cached_property
    def patients(self) -> dict[str, dict]:
        return by_id(patients_repo.list_all())

    @cached_property
    def profiles(self) -> dict[str, dict]:
        return by_id(profiles_repo.list_all())

    @cached_property
    def patient_by_bed(self) -> dict[str, dict]:
        return {p["bed_id"]: p for p in self.patients.values() if p.get("bed_id")}

    @cached_property
    def monitor_by_bed(self) -> dict[str, dict]:
        return {m["bed_id"]: m for m in self.monitors.values() if m.get("bed_id")}

    # -- presenters ------------------------------------------------------------------------

    def person(self, profile_id: str | None) -> dict | None:
        p = self.profiles.get(profile_id) if profile_id else None
        if not p:
            return None
        return {"id": p["id"], "full_name": p["full_name"], "role": p["role"], "title": p.get("title"), "avatar_url": p.get("avatar_url")}

    def bed(self, bed_id: str | None) -> dict | None:
        b = self.beds.get(bed_id) if bed_id else None
        if not b:
            return None
        w = self.wards.get(b["ward_id"], {})
        return {
            "id": b["id"],
            "label": b["label"],
            "ward_id": b["ward_id"],
            "ward_code": w.get("code"),
            "ward_name": w.get("name"),
            "display": f"{w.get('code', '')}-{b['label']}",
        }

    def patient_brief(self, patient_id: str | None) -> dict | None:
        p = self.patients.get(patient_id) if patient_id else None
        if not p:
            return None
        if not self.clinical:
            return {"id": None, "name": "Patient (restricted)", "initials": "—", "mrn": None}
        return {
            "id": p["id"],
            "name": f"{p['first_name']} {p['last_name']}",
            "initials": f"{p['first_name'][0]}{p['last_name'][0]}",
            "mrn": p["mrn"],
            "age": age_from(p.get("date_of_birth")),
            "sex": p["sex"],
        }

    def monitor_brief(self, monitor_id: str | None) -> dict | None:
        m = self.monitors.get(monitor_id) if monitor_id else None
        if not m:
            return None
        return {"id": m["id"], "serial": m["serial"], "model": m["model"]}

    def monitor_live(self, m: dict) -> dict:
        """Monitor with its latest values; values are hidden when the monitor is offline."""
        online = m["connection"] == "connected" and m["status"] == "in_use"
        latest = m.get("latest") or {}
        return {
            "id": m["id"],
            "serial": m["serial"],
            "model": m["model"],
            "asset_tag": m["asset_tag"],
            "firmware": m["firmware"],
            "status": m["status"],
            "connection": m["connection"],
            "sensor_status": m["sensor_status"],
            "battery_pct": m["battery_pct"],
            "signal_quality": m["signal_quality"],
            "fault": m.get("fault", "none"),
            "last_seen_at": m.get("last_seen_at"),
            "last_service_at": m.get("last_service_at"),
            "next_service_due": m.get("next_service_due"),
            "bed": self.bed(m.get("bed_id")),
            "vitals": {
                "hr": latest.get("hr") if online else None,
                "spo2": latest.get("spo2") if online else None,
                "rr": latest.get("rr") if online else None,
                "sys": latest.get("sys") if online else None,
                "dia": latest.get("dia") if online else None,
                "map": latest.get("map") if online else None,
                "ts": latest.get("ts"),
            },
        }

    def alarm(self, a: dict) -> dict:
        return {
            **a,
            "state": alarm_state(a),
            "patient": self.patient_brief(a.get("patient_id")),
            "bed": self.bed(a.get("bed_id")),
            "monitor": self.monitor_brief(a.get("monitor_id")),
            "acknowledged_by_user": self.person(a.get("acknowledged_by")),
        }


def alarm_state(a: dict) -> str:
    if not a.get("condition_active"):
        return "resolved"
    return "acknowledged" if a.get("acknowledged_at") else "active"


def alarm_summary(alarms: list[dict]) -> dict:
    open_alarms = [a for a in alarms if a.get("condition_active")]
    if not open_alarms:
        return {"count": 0, "unacknowledged": 0, "highest": None}
    highest = min(open_alarms, key=lambda a: SEVERITY_ORDER.get(a["severity"], 9))["severity"]
    return {
        "count": len(open_alarms),
        "unacknowledged": sum(1 for a in open_alarms if not a.get("acknowledged_at")),
        "highest": highest,
    }
