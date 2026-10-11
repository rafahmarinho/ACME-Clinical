"""Deterministic simulation engine.

Given the current state (monitors, patients, thresholds, open alarms) the
engine advances the ward minute by minute and returns everything that has to
be persisted: readings, monitor updates, alarm changes, events and simulated
integration messages. It performs no I/O, which keeps it easy to test.

Alarm rules
-----------
* An alarm is raised when a condition starts and stays open
  (``condition_active``) for as long as the condition persists.
* Acknowledging an alarm only records who saw it. It never closes it.
* An alarm is resolved only when the engine can observe that the condition has
  stopped. If the data needed to judge it is missing (sensor off, monitor
  offline) the alarm stays open.
* A warning that worsens to critical re-alarms (its acknowledgement is cleared).
"""

import math
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.services.clock import iso, parse

PARAMS = ("hr", "spo2", "rr", "sys", "dia")
PARAM_INFO = {
    "hr": ("Heart rate", "bpm"),
    "spo2": ("SpO₂", "%"),
    "rr": ("Respiratory rate", "/min"),
    "sys": ("Systolic BP", "mmHg"),
    "dia": ("Diastolic BP", "mmHg"),
}
HYSTERESIS = {"hr": 2, "spo2": 1, "rr": 1, "sys": 3, "dia": 2}
SEVERITY_RANK = {"advisory": 0, "warning": 1, "critical": 2}
TECHNICAL_TYPES = ("battery_low", "sensor_issue", "connection_lost")

ALARM_COLUMNS = (
    "id", "monitor_id", "patient_id", "bed_id", "type", "category", "severity", "parameter", "message",
    "value", "limit_value", "condition_active", "started_at", "last_seen_at", "resolved_at", "resolution",
    "acknowledged_at", "acknowledged_by", "ack_note", "escalated_at", "created_at",
)


@dataclass
class Condition:
    type: str
    category: str
    severity: str
    message: str
    parameter: str | None = None
    value: float | None = None
    limit: float | None = None


@dataclass
class EngineResult:
    readings: list[dict] = field(default_factory=list)
    monitors: dict[str, dict] = field(default_factory=dict)
    alarms: dict[str, dict] = field(default_factory=dict)  # id -> full alarm row (new or changed)
    events: list[dict] = field(default_factory=list)
    messages: list[dict] = field(default_factory=list)
    tick: int = 0
    sim_time: datetime | None = None


class ThresholdBook:
    def __init__(self, rows: list[dict]):
        self.defaults: dict[str, dict] = {}
        self.overrides: dict[tuple[str, str], dict] = {}
        for r in rows:
            if r.get("patient_id"):
                self.overrides[(r["patient_id"], r["parameter"])] = r
            else:
                self.defaults[r["parameter"]] = r

    def get(self, patient_id: str | None, parameter: str) -> dict | None:
        if patient_id and (patient_id, parameter) in self.overrides:
            return self.overrides[(patient_id, parameter)]
        return self.defaults.get(parameter)


def _num(v) -> float | None:
    return None if v is None else float(v)


def evaluate_parameter(parameter: str, value: float, th: dict | None, open_types: set[str]) -> Condition | None:
    """Compare one vital sign with its limits. Open alarms use hysteresis before clearing."""
    if th is None or not th.get("enabled", True):
        return None
    label, unit = PARAM_INFO[parameter]
    margin = HYSTERESIS[parameter]
    warn_low, crit_low = _num(th.get("warn_low")), _num(th.get("crit_low"))
    warn_high, crit_high = _num(th.get("warn_high")), _num(th.get("crit_high"))

    low_type, high_type = f"{parameter}_low", f"{parameter}_high"
    low_margin = margin if low_type in open_types else 0
    high_margin = margin if high_type in open_types else 0

    def fmt(x: float) -> str:
        return f"{x:g}"

    if crit_low is not None and value < crit_low:
        return Condition(low_type, "clinical", "critical", f"{label} critically low — {fmt(value)} {unit} (limit {fmt(crit_low)})", parameter, value, crit_low)
    if warn_low is not None and value < warn_low + low_margin:
        return Condition(low_type, "clinical", "warning", f"{label} low — {fmt(value)} {unit} (limit {fmt(warn_low)})", parameter, value, warn_low)
    if crit_high is not None and value > crit_high:
        return Condition(high_type, "clinical", "critical", f"{label} critically high — {fmt(value)} {unit} (limit {fmt(crit_high)})", parameter, value, crit_high)
    if warn_high is not None and value > warn_high - high_margin:
        return Condition(high_type, "clinical", "warning", f"{label} high — {fmt(value)} {unit} (limit {fmt(warn_high)})", parameter, value, warn_high)
    return None


def sensor_kind(serial: str) -> str:
    """Which sensor fails for a monitor under the 'sensor' fault (stable per device)."""
    return "ecg_leads_off" if int(serial[-1]) % 2 == 1 else "spo2_probe_off"


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


class SimulationEngine:
    def __init__(
        self,
        *,
        state: dict,
        monitors: list[dict],
        patients: list[dict],
        beds: list[dict],
        thresholds: list[dict],
        open_alarms: list[dict],
        settings: dict,
        profiles: list[dict],
    ):
        self.state = state
        self.seed = int(state.get("seed", 2026))
        self.tick_seconds = int(state.get("tick_seconds", 60))
        self.tick = int(state["tick"])
        self.sim_time = parse(state["sim_time"])
        self.monitors = [dict(m) for m in monitors]
        self.patients_by_bed = {p["bed_id"]: p for p in patients if p.get("bed_id") and p.get("status", "admitted") == "admitted"}
        self.beds = {b["id"]: b for b in beds}
        self.thresholds = ThresholdBook(thresholds)
        self.open = {(a["monitor_id"], a["type"]): dict(a) for a in open_alarms if a.get("condition_active")}
        self.settings = settings
        self.profiles = {p["id"]: p for p in profiles}
        self.result = EngineResult()

    # -- public ----------------------------------------------------------------------------

    def run(self, ticks: int, schedule: dict[int, list[tuple[str, str]]] | None = None,
            responder: dict | None = None) -> EngineResult:
        """Advance ``ticks`` minutes.

        ``schedule`` scripts faults ({tick: [(serial, fault)]}). ``responder``
        ({"id", "full_name"}) acknowledges new alarms 1-2 minutes after they start;
        it is only used to build realistic history after a demo reset.
        """
        for _ in range(ticks):
            self.tick += 1
            self.sim_time = self.sim_time + timedelta(seconds=self.tick_seconds)
            if schedule and self.tick in schedule:
                for serial, fault in schedule[self.tick]:
                    self.set_fault(serial, fault)
            for index, monitor in enumerate(self.monitors):
                self._step_monitor(index, monitor)
            if responder:
                self._respond(responder)
            self._escalate()
            self._ehr_sync()
        self.result.tick = self.tick
        self.result.sim_time = self.sim_time
        return self.result

    def set_fault(self, serial: str, fault: str) -> None:
        for m in self.monitors:
            if m["serial"] == serial:
                m["fault"] = fault
                m["fault_started_tick"] = self.tick if fault != "none" else None
                self.result.monitors[m["id"]] = m

    # -- per monitor -------------------------------------------------------------------------

    def _step_monitor(self, index: int, m: dict) -> None:
        if m["status"] == "maintenance":
            return
        rng = random.Random(f"{self.seed}:{self.tick}:{m['serial']}")
        patient = self.patients_by_bed.get(m.get("bed_id")) if m.get("bed_id") else None
        in_use = m["status"] == "in_use" and patient is not None
        prev_connection = m["connection"]
        fault = m.get("fault") or "none"
        now_iso = iso(self.sim_time)

        # Battery: docked monitors charge, monitors in use drain (fast when the battery is weak).
        battery = float(m["battery_pct"])
        if m["status"] == "available":
            battery = min(100.0, battery + 1.5)
        else:
            battery = max(0.0, battery - (2.6 if fault == "low_battery" else 0.12))
        m["battery_pct"] = round(battery, 1)

        connected = not (fault == "disconnect" or battery <= 0)
        m["connection"] = "connected" if connected else "lost"
        m["sensor_status"] = sensor_kind(m["serial"]) if fault == "sensor" and connected else "ok"
        if not connected:
            m["signal_quality"] = 0
        elif m["sensor_status"] != "ok":
            m["signal_quality"] = rng.randint(15, 35)
        else:
            m["signal_quality"] = rng.randint(88, 100)
        if connected:
            m["last_seen_at"] = now_iso

        if prev_connection != m["connection"]:
            if connected:
                self._event("device.connection_restored", "info", "monitor", m["id"], f"{m['serial']} reconnected to the central station")
            else:
                reason = "battery depleted" if battery <= 0 else "network connection lost"
                self._event("device.connection_lost", "critical", "monitor", m["id"], f"{m['serial']} went offline ({reason})")

        reading = None
        if in_use and connected:
            reading = self._vitals(index, m, patient, fault, rng)
            m["latest"] = {**reading, "ts": now_iso}
            self.result.readings.append(
                {
                    "monitor_id": m["id"],
                    "patient_id": patient["id"],
                    "recorded_at": now_iso,
                    "tick": self.tick,
                    **{k: reading.get(k) for k in ("hr", "spo2", "rr", "sys", "dia", "map")},
                    "battery_pct": m["battery_pct"],
                    "signal_quality": m["signal_quality"],
                }
            )
        self.result.monitors[m["id"]] = m

        if in_use:
            self._update_alarms(m, patient, reading)

    def _vitals(self, index: int, m: dict, patient: dict, fault: str, rng: random.Random) -> dict:
        base = patient.get("baseline") or {}
        wave = math.sin(2 * math.pi * (self.tick + index * 13) / 90)
        hr = base.get("hr", 80) + 4 * wave + rng.gauss(0, 1.8)
        spo2 = base.get("spo2", 97) + 0.8 * wave + rng.gauss(0, 0.6)
        rr = base.get("rr", 16) + 1.5 * wave + rng.gauss(0, 0.8)

        latest = m.get("latest") or {}
        nibp_due = latest.get("sys") is None or (self.tick % 5) == (index % 5)
        if nibp_due:
            sys_bp = base.get("sys", 120) + 5 * wave + rng.gauss(0, 3)
            dia_bp = base.get("dia", 75) + 3 * wave + rng.gauss(0, 2)
        else:
            sys_bp, dia_bp = latest["sys"], latest["dia"]

        if fault == "desaturation":
            elapsed = self.tick - (m.get("fault_started_tick") or self.tick)
            p = min(1.0, max(0.0, elapsed / 8))
            spo2 -= p * (base.get("spo2", 97) - 83)
            hr += p * 16
            rr += p * 7

        values = {
            "hr": round(_clamp(hr, 25, 220)),
            "spo2": round(_clamp(spo2, 50, 100)),
            "rr": round(_clamp(rr, 4, 60)),
            "sys": round(sys_bp),
            "dia": round(dia_bp),
        }
        values["map"] = round((values["sys"] + 2 * values["dia"]) / 3)
        if m["sensor_status"] == "spo2_probe_off":
            values["spo2"] = None
        if m["sensor_status"] == "ecg_leads_off":
            values["hr"] = None
        return values

    # -- alarms ------------------------------------------------------------------------------

    def _conditions(self, m: dict, patient: dict, reading: dict | None) -> tuple[dict[str, Condition], set[str]]:
        """Return current conditions and the set of alarm types that can be judged right now."""
        conditions: dict[str, Condition] = {}
        evaluable: set[str] = set(TECHNICAL_TYPES)
        low_pct = float(self.settings.get("battery_low_pct", 20))
        crit_pct = float(self.settings.get("battery_critical_pct", 10))
        battery = m["battery_pct"]

        if battery <= low_pct:
            severity = "critical" if battery <= crit_pct else "warning"
            conditions["battery_low"] = Condition(
                "battery_low", "technical", severity, f"Battery low — {battery:.0f}% remaining", None, battery, crit_pct if severity == "critical" else low_pct
            )
        if m["connection"] == "lost":
            conditions["connection_lost"] = Condition(
                "connection_lost", "technical", "critical", "Monitor offline — no data received by the central station"
            )
        elif m["sensor_status"] == "ecg_leads_off":
            conditions["sensor_issue"] = Condition("sensor_issue", "technical", "warning", "ECG leads off — check electrode placement")
        elif m["sensor_status"] == "spo2_probe_off":
            conditions["sensor_issue"] = Condition("sensor_issue", "technical", "warning", "SpO₂ probe off — reposition the finger sensor")

        if reading is not None:
            open_types = {t for (mid, t) in self.open if mid == m["id"]}
            for p in PARAMS:
                value = reading.get(p)
                if value is None:
                    continue
                evaluable.update({f"{p}_low", f"{p}_high"})
                cond = evaluate_parameter(p, float(value), self.thresholds.get(patient["id"], p), open_types)
                if cond:
                    conditions[cond.type] = cond
        return conditions, evaluable

    def _update_alarms(self, m: dict, patient: dict, reading: dict | None) -> None:
        conditions, evaluable = self._conditions(m, patient, reading)
        now = iso(self.sim_time)
        bed = self.beds.get(m.get("bed_id"), {})
        who = f"{patient['first_name']} {patient['last_name']}"
        where = bed.get("label", "")

        for cond in conditions.values():
            key = (m["id"], cond.type)
            alarm = self.open.get(key)
            if alarm is None:
                alarm = {c: None for c in ALARM_COLUMNS}
                alarm.update(
                    id=str(uuid.uuid4()),
                    monitor_id=m["id"],
                    patient_id=patient["id"],
                    bed_id=m.get("bed_id"),
                    type=cond.type,
                    category=cond.category,
                    severity=cond.severity,
                    parameter=cond.parameter,
                    message=cond.message,
                    value=cond.value,
                    limit_value=cond.limit,
                    condition_active=True,
                    started_at=now,
                    last_seen_at=now,
                    created_at=now,
                )
                self.open[key] = alarm
                self._event(
                    "alarm.raised", "critical" if cond.severity == "critical" else "warning", "alarm", alarm["id"],
                    f"{cond.message} · {who} ({where}, {m['serial']})",
                    {"type": cond.type, "severity": cond.severity, "monitor": m["serial"]},
                )
                if cond.severity == "critical":
                    self._page_nurse(patient, alarm, who, where)
            else:
                previous = alarm["severity"]
                alarm.update(message=cond.message, value=cond.value, limit_value=cond.limit, last_seen_at=now)
                if SEVERITY_RANK[cond.severity] > SEVERITY_RANK[previous]:
                    alarm["severity"] = cond.severity
                    if alarm.get("acknowledged_at"):
                        alarm.update(acknowledged_at=None, acknowledged_by=None, ack_note=None)
                    self._event(
                        "alarm.escalated", "critical", "alarm", alarm["id"],
                        f"Alarm worsened to {cond.severity}: {cond.message} · {who} ({where})",
                        {"type": cond.type, "from": previous, "to": cond.severity},
                    )
                    if cond.severity == "critical":
                        self._page_nurse(patient, alarm, who, where)
                elif SEVERITY_RANK[cond.severity] < SEVERITY_RANK[previous]:
                    alarm["severity"] = cond.severity
            self.result.alarms[alarm["id"]] = alarm

        # Close alarms whose condition has observably stopped.
        for key in [k for k in self.open if k[0] == m["id"]]:
            alarm = self.open[key]
            if alarm["type"] in conditions or alarm["type"] not in evaluable:
                continue
            alarm.update(condition_active=False, resolved_at=now, resolution="Condition cleared", last_seen_at=now)
            self.result.alarms[alarm["id"]] = alarm
            del self.open[key]
            ack = " (had been acknowledged)" if alarm.get("acknowledged_at") else " (never acknowledged)"
            self._event(
                "alarm.resolved", "info", "alarm", alarm["id"],
                f"Resolved: {alarm['message'].split(' — ')[0]} · {who} ({where}){ack}",
                {"type": alarm["type"]},
            )

    def _respond(self, responder: dict) -> None:
        for alarm in self.open.values():
            if alarm.get("acknowledged_at"):
                continue
            delay = 1 + random.Random(alarm["id"]).randint(0, 1)
            if (self.sim_time - parse(alarm["started_at"])).total_seconds() < delay * 60:
                continue
            alarm.update(acknowledged_at=iso(self.sim_time), acknowledged_by=responder["id"], ack_note="Checked at bedside.")
            self.result.alarms[alarm["id"]] = alarm
            self._event("alarm.acknowledged", "info", "alarm", alarm["id"],
                        f"{responder['full_name']} acknowledged: {alarm['message']} (condition still active)")

    def _escalate(self) -> None:
        minutes = float(self.settings.get("escalation_minutes", 3))
        for alarm in self.open.values():
            if alarm["severity"] != "critical" or alarm.get("acknowledged_at") or alarm.get("escalated_at"):
                continue
            started = parse(alarm["started_at"])
            if (self.sim_time - started).total_seconds() < minutes * 60:
                continue
            alarm["escalated_at"] = iso(self.sim_time)
            self.result.alarms[alarm["id"]] = alarm
            patient = next((p for p in self.patients_by_bed.values() if p["id"] == alarm["patient_id"]), None)
            attending = self.profiles.get(patient.get("attending_id")) if patient else None
            name = attending["full_name"] if attending else "On-call physician"
            self._event(
                "alarm.escalated_to_physician", "critical", "alarm", alarm["id"],
                f"Unacknowledged critical alarm escalated to {name}: {alarm['message']}",
            )
            self._message("pager", f"Pager · {name}", f"ESCALATION: {alarm['message']}",
                          f"Critical alarm unacknowledged for {minutes:g} min. Bed {self.beds.get(alarm['bed_id'], {}).get('label', '?')}.",
                          "alarm", alarm["id"])

    def _page_nurse(self, patient: dict, alarm: dict, who: str, where: str) -> None:
        nurse = self.profiles.get(patient.get("primary_nurse_id"))
        name = nurse["full_name"] if nurse else "Charge nurse"
        self._message("pager", f"Pager · {name}", f"CRITICAL {where}: {alarm['message']}", f"Patient {who}. Respond at bedside.", "alarm", alarm["id"])

    def _ehr_sync(self) -> None:
        interval = int(self.settings.get("ehr_sync_minutes", 15))
        if interval <= 0 or self.tick % interval:
            return
        batch = [r for r in self.result.readings if r["tick"] == self.tick]
        if not batch:
            return
        first = batch[0]
        body = (
            f"MSH|^~\\&|ACME_CLINICAL|ACME_GH|EHR|ACME_GH|{self.sim_time:%Y%m%d%H%M}||ORU^R01|{self.tick}|P|2.5.1\n"
            f"OBX|1|NM|8867-4^Heart rate^LN||{first.get('hr') or ''}|/min\n"
            f"OBX|2|NM|59408-5^SpO2^LN||{first.get('spo2') or ''}|%\n"
            f"… {len(batch)} patient observation sets in this batch"
        )
        self._message("ehr", "EHR · HL7 v2 interface", f"ORU^R01 vitals batch — {len(batch)} patients", body, None, None)
        self._event("integration.ehr_sync", "info", None, None, f"Vitals for {len(batch)} patients sent to the EHR (simulated HL7 ORU^R01)")

    # -- output helpers ----------------------------------------------------------------------

    def _event(self, kind: str, severity: str, entity_type: str | None, entity_id: str | None, message: str, data: dict | None = None) -> None:
        self.result.events.append(
            {
                "occurred_at": iso(self.sim_time),
                "tick": self.tick,
                "kind": kind,
                "severity": severity,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "message": message,
                "data": data or {},
            }
        )

    def _message(self, channel: str, recipient: str, subject: str, body: str, related_type: str | None, related_id: str | None) -> None:
        if not (self.settings.get("integrations") or {}).get(channel, True):
            return
        self.result.messages.append(
            {
                "channel": channel,
                "recipient": recipient,
                "subject": subject,
                "body": body,
                "status": "delivered",
                "related_type": related_type,
                "related_id": related_id,
                "sim_time": iso(self.sim_time),
            }
        )
