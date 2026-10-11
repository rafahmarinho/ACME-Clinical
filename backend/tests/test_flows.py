"""End-to-end API flows against the in-memory database."""

from app.services.seed_data import bed_id, monitor_id, patient_id
from tests.conftest import auth

JAMES = patient_id("ACM-100458")  # monitored by VX5-1002
GRACE = patient_id("ACM-101066")  # 5E-B03, no monitor
SPARE = monitor_id("VX5-1009")


def advance(client, ticks=1, role="admin"):
    r = client.post("/api/simulation/advance", json={"ticks": ticks}, headers=auth(role))
    assert r.status_code == 200, r.text
    return r.json()


def open_alarm(client, patient, type_):
    rows = client.get(f"/api/alarms?status=open&patient_id={patient}", headers=auth("nurse")).json()
    return next((a for a in rows if a["type"] == type_), None)


def test_requires_authentication(client):
    assert client.get("/api/overview").status_code == 401
    assert client.get("/api/overview", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/health").json()["status"] == "ok"


def test_seeded_demo_data(client):
    data = client.get("/api/overview", headers=auth("nurse")).json()
    assert len(data["wards"]) == 2
    assert data["kpis"]["patients"] == 12
    assert data["kpis"]["devices_total"] == 10
    assert data["kpis"]["monitored"] == 8
    assert data["sim"]["tick"] == 120
    live = client.get("/api/monitoring/live", headers=auth("nurse")).json()
    assert len(live) == 8 and all(m["vitals"]["hr"] for m in live)
    # Warm-up history contains resolved, acknowledged alarms.
    resolved = client.get("/api/alarms?status=resolved", headers=auth("nurse")).json()
    assert resolved and all(a["state"] == "resolved" for a in resolved)


def test_acknowledging_does_not_clear_an_ongoing_condition(client):
    client.post("/api/simulation/scenario", json={"scenario": "desaturation"}, headers=auth("admin"))
    advance(client, 10)
    alarm = open_alarm(client, JAMES, "spo2_low")
    assert alarm is not None and alarm["severity"] == "critical" and alarm["state"] == "active"

    r = client.post(f"/api/alarms/{alarm['id']}/acknowledge", json={"note": "On my way, applying O2"}, headers=auth("nurse"))
    assert r.status_code == 200
    acked = r.json()
    assert acked["state"] == "acknowledged"
    assert acked["condition_active"] is True
    assert acked["acknowledged_by_user"]["full_name"] == "Olivia Bennett"

    # The condition persists: the alarm stays open (still acknowledged) as time passes.
    advance(client, 5)
    still = open_alarm(client, JAMES, "spo2_low")
    assert still is not None and still["id"] == alarm["id"] and still["state"] == "acknowledged"
    assert client.post(f"/api/alarms/{alarm['id']}/acknowledge", json={}, headers=auth("nurse")).status_code == 400

    # Only when the patient recovers does the engine resolve it.
    client.post("/api/simulation/scenario", json={"scenario": "normal"}, headers=auth("admin"))
    advance(client, 5)
    assert open_alarm(client, JAMES, "spo2_low") is None
    history = client.get(f"/api/patients/{JAMES}/alarms", headers=auth("nurse")).json()
    resolved = next(a for a in history if a["id"] == alarm["id"])
    assert resolved["state"] == "resolved" and resolved["resolution"] == "Condition cleared"
    # The acknowledgement note was copied to the patient's notes.
    notes = client.get(f"/api/patients/{JAMES}/notes", headers=auth("nurse")).json()
    assert any("applying O2" in n["body"] for n in notes)


def test_unacknowledged_critical_alarm_escalates_to_physician_pager(client, db):
    client.post("/api/simulation/scenario", json={"scenario": "desaturation"}, headers=auth("admin"))
    advance(client, 15)
    alarm = open_alarm(client, JAMES, "spo2_low")
    assert alarm["escalated_at"] is not None
    pages = client.get("/api/simulation/integrations?channel=pager", headers=auth("admin")).json()
    assert any("ESCALATION" in m["subject"] for m in pages)


def test_device_scenarios_raise_technical_alarms(client):
    client.post("/api/simulation/scenario", json={"scenario": "busy_shift"}, headers=auth("biomed"))
    advance(client, 30, role="biomed")
    alarms = client.get("/api/alarms?status=open", headers=auth("biomed")).json()
    types = {a["type"] for a in alarms}
    assert {"battery_low", "sensor_issue", "connection_lost"} <= types
    # Biomedical technicians only see technical alarms and no patient identity.
    assert all(a["category"] == "technical" for a in alarms)
    assert all(a["patient"] is None or a["patient"]["id"] is None for a in alarms)
    live = {m["serial"]: m for m in client.get("/api/monitoring/live", headers=auth("nurse")).json()}
    assert live["VX5-1008"]["connection"] == "lost" and live["VX5-1008"]["vitals"]["hr"] is None
    assert live["VX5-1006"]["sensor_status"] == "spo2_probe_off" and live["VX5-1006"]["vitals"]["spo2"] is None
    assert live["VX5-1005"]["battery_pct"] < 20


def test_role_permissions(client):
    assert client.get("/api/patients", headers=auth("biomed")).status_code == 403
    assert client.post("/api/simulation/reset", headers=auth("nurse")).status_code == 403
    assert client.post("/api/simulation/advance", json={"ticks": 1}, headers=auth("nurse")).status_code == 403
    assert client.post("/api/team", json={"email": "a@b.test", "full_name": "A B", "role": "nurse"}, headers=auth("physician")).status_code == 403
    th = {"thresholds": [{"parameter": "hr", "warn_low": 50, "warn_high": 130, "crit_low": 40, "crit_high": 150}]}
    assert client.put(f"/api/patients/{JAMES}/thresholds", json=th, headers=auth("nurse")).status_code == 403
    # Biomed cannot acknowledge a clinical alarm.
    client.post("/api/simulation/scenario", json={"scenario": "desaturation"}, headers=auth("admin"))
    advance(client, 10)
    alarm = open_alarm(client, JAMES, "spo2_low")
    assert client.post(f"/api/alarms/{alarm['id']}/acknowledge", json={}, headers=auth("biomed")).status_code in (403, 404)


def test_assign_spare_monitor_to_bed_and_unassign(client):
    beds = client.get("/api/beds/available", headers=auth("nurse")).json()
    target = next(b for b in beds if b["patient"]["id"] == GRACE)
    r = client.post(f"/api/monitors/{SPARE}/assign", json={"bed_id": target["bed"]["id"]}, headers=auth("nurse"))
    assert r.status_code == 200, r.text
    assert r.json()["bed"]["display"] == "5E-B03"
    # Assigning the same bed twice is rejected.
    r2 = client.post(f"/api/monitors/{SPARE}/assign", json={"bed_id": bed_id("5E", "B03")}, headers=auth("nurse"))
    assert r2.status_code == 400
    advance(client, 2)
    patient = client.get(f"/api/patients/{GRACE}", headers=auth("nurse")).json()
    assert patient["monitor"]["serial"] == "VX5-1009" and patient["monitor"]["vitals"]["hr"]
    assert client.get(f"/api/patients/{GRACE}/readings?hours=1", headers=auth("nurse")).json()["count"] == 2
    r = client.post(f"/api/monitors/{SPARE}/unassign", headers=auth("nurse"))
    assert r.status_code == 200 and r.json()["status"] == "available"
    assert client.post(f"/api/monitors/{SPARE}/assign", json={"bed_id": bed_id("5E", "B04")}, headers=auth("nurse")).status_code == 400


def test_maintenance_tracking(client):
    m = monitor_id("VX5-1007")
    r = client.post("/api/maintenance", json={"monitor_id": m, "kind": "inspection", "title": "Cable strain relief check"},
                    headers=auth("biomed"))
    assert r.status_code == 201
    rec = r.json()
    r = client.patch(f"/api/maintenance/{rec['id']}", json={"status": "completed", "resolution": "Replaced SpO2 cable"},
                     headers=auth("biomed"))
    assert r.json()["status"] == "completed" and r.json()["completed_at"]
    detail = client.get(f"/api/monitors/{m}", headers=auth("biomed")).json()
    assert detail["service_overdue"] is False
    assert client.post("/api/maintenance", json={"monitor_id": m, "kind": "repair", "title": "x y z"}, headers=auth("nurse")).status_code == 403
    # Maintenance mode unassigns and blocks assignment.
    r = client.post(f"/api/monitors/{m}/maintenance-mode", json={"enabled": True}, headers=auth("biomed"))
    assert r.json()["status"] == "maintenance" and r.json()["bed"] is None
    r = client.post(f"/api/monitors/{m}/replace-battery", headers=auth("biomed"))
    assert r.json()["battery_pct"] == 100


def test_thresholds(client):
    th = {"thresholds": [{"parameter": "hr", "warn_low": 50, "warn_high": 130, "crit_low": 40, "crit_high": 150}]}
    r = client.put(f"/api/patients/{JAMES}/thresholds", json=th, headers=auth("physician"))
    assert r.status_code == 200
    hr = next(t for t in r.json() if t["parameter"] == "hr")
    assert hr["source"] == "patient" and hr["warn_high"] == 130
    bad = {"thresholds": [{"parameter": "hr", "warn_low": 50, "warn_high": 130, "crit_low": 60, "crit_high": 150}]}
    assert client.put(f"/api/patients/{JAMES}/thresholds", json=bad, headers=auth("physician")).status_code == 400
    r = client.delete(f"/api/patients/{JAMES}/thresholds/hr", headers=auth("physician"))
    assert next(t for t in r.json() if t["parameter"] == "hr")["source"] == "default"
    defaults = client.get("/api/thresholds/defaults", headers=auth("nurse")).json()
    assert len(defaults) == 5
    assert len(client.get("/api/thresholds/overrides", headers=auth("nurse")).json()) == 4


def test_reports_pdf_and_csv(client, db):
    for kind, fmt, extra in [("shift_summary", "pdf", {}), ("patient_summary", "pdf", {"patient_id": JAMES}),
                             ("device_status", "pdf", {}), ("alarm_log", "csv", {})]:
        r = client.post("/api/reports", json={"kind": kind, "format": fmt, "hours": 2, **extra}, headers=auth("admin"))
        assert r.status_code == 201, r.text
        report = r.json()
        content = db.files[("reports", report["file_path"])]
        assert content.startswith(b"%PDF") if fmt == "pdf" else b"Started At" in content
        assert client.get(f"/api/reports/{report['id']}/download", headers=auth("admin")).json()["url"]
    assert client.post("/api/reports", json={"kind": "device_status"}, headers=auth("nurse")).status_code == 403
    listing = client.get("/api/reports", headers=auth("admin")).json()
    assert len(listing["reports"]) == 4
    rid = listing["reports"][0]["id"]
    assert client.post(f"/api/reports/{rid}/email", json={"recipient": "quality@acme-clinical.test"}, headers=auth("admin")).status_code == 200


def test_notes_search_profile_settings(client):
    r = client.post(f"/api/patients/{JAMES}/notes", json={"category": "handoff", "body": "Stable overnight."}, headers=auth("nurse"))
    assert r.status_code == 201 and r.json()["author"]["full_name"] == "Olivia Bennett"
    found = client.get("/api/search?q=whit", headers=auth("nurse")).json()
    assert found["patients"][0]["name"] == "James Whitaker"
    assert client.get("/api/search?q=whit", headers=auth("biomed")).json()["patients"] == []
    me = client.patch("/api/me", json={"phone": "+1 555 0100", "preferences": {"alarm_sound": False}}, headers=auth("nurse")).json()
    assert me["phone"] == "+1 555 0100" and me["preferences"]["alarm_sound"] is False and me["preferences"]["show_waveforms"] is True
    s = client.put("/api/settings", json={"escalation_minutes": 5}, headers=auth("admin")).json()
    assert s["escalation_minutes"] == 5
    assert client.put("/api/settings", json={"battery_critical_pct": 25}, headers=auth("admin")).status_code == 400


def test_team_management(client):
    r = client.post("/api/team", json={"email": "new.nurse@acme-clinical.test", "full_name": "Maya Singh", "role": "nurse"},
                    headers=auth("admin"))
    assert r.status_code == 201, r.text
    member = r.json()["member"]
    assert r.json()["temporary_password"].startswith("Acme-")
    r = client.patch(f"/api/team/{member['id']}", json={"role": "physician", "is_active": False}, headers=auth("admin"))
    assert r.json()["role"] == "physician" and r.json()["is_active"] is False
    me = client.get("/api/me", headers=auth("admin")).json()
    assert client.patch(f"/api/team/{me['id']}", json={"is_active": False}, headers=auth("admin")).status_code == 400


def test_waveforms_and_events(client):
    live = client.get("/api/monitoring/waveforms?seconds=2", headers=auth("nurse")).json()
    assert len(live) == 8
    sample = next(iter(live.values()))
    assert len(sample["ecg"]) == 400 and sample["online"]
    events = client.get("/api/simulation/events?limit=20", headers=auth("admin")).json()
    assert events[0]["kind"] == "demo.reset"


def test_reset_restores_initial_state(client):
    client.post("/api/simulation/scenario", json={"scenario": "connection_loss"}, headers=auth("admin"))
    advance(client, 3)
    r = client.post("/api/simulation/reset", headers=auth("admin"))
    assert r.status_code == 200 and r.json()["patients"] == 12
    state = client.get("/api/simulation", headers=auth("admin")).json()
    assert state["state"]["scenario"] == "normal" and state["state"]["tick"] == 120
    assert all(m["fault"] == "none" for m in state["monitors"])
