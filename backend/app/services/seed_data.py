"""Fictional demo data for ACME Clinical.

Every person, record number and device below is invented. IDs are derived
with uuid5 so links stay stable across demo resets.
"""

import uuid
from datetime import date, timedelta

NAMESPACE = uuid.UUID("6f1c2f6e-2d55-4b71-9a43-a0c0e0c11a1c")


def sid(kind: str, key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{kind}:{key}"))


DOMAIN = "acme-clinical.test"

# email, full name, role, title
DEMO_USERS = [
    (f"nurse@{DOMAIN}", "Olivia Bennett", "nurse", "RN, Charge Nurse"),
    (f"physician@{DOMAIN}", "Dr. Marcus Hale", "physician", "MD, Cardiology"),
    (f"biomed@{DOMAIN}", "Priya Raman", "biomed", "Biomedical Technician II"),
    (f"admin@{DOMAIN}", "Daniel Okafor", "admin", "Clinical Systems Administrator"),
    (f"sofia.alvarez@{DOMAIN}", "Sofia Alvarez", "nurse", "RN"),
    (f"hannah.cho@{DOMAIN}", "Dr. Hannah Cho", "physician", "MD, Internal Medicine"),
    (f"leo.martins@{DOMAIN}", "Leo Martins", "biomed", "Biomedical Engineer"),
]

WARDS = [
    {"code": "4W", "name": "4 West · Cardiac Step-Down", "floor": "Floor 4"},
    {"code": "5E", "name": "5 East · Medical-Surgical", "floor": "Floor 5"},
]

# Bed layout in metres for the 3D ward view (two facing rows).
BED_LAYOUT = {
    "4W": [(f"B0{i + 1}", -7.5 + (i % 4) * 5, -4.5 if i < 4 else 4.5) for i in range(8)],
    "5E": [(f"B0{i + 1}", -5 + (i % 3) * 5, -4.5 if i < 3 else 4.5) for i in range(6)],
}


def ward_id(code: str) -> str:
    return sid("ward", code)


def bed_id(ward_code: str, label: str) -> str:
    return sid("bed", f"{ward_code}-{label}")


def monitor_id(serial: str) -> str:
    return sid("monitor", serial)


def patient_id(mrn: str) -> str:
    return sid("patient", mrn)


# mrn, first, last, sex, age, ward, bed, diagnosis, acuity, allergies, code status, isolation,
# baseline (hr, spo2, rr, sys, dia), attending email, primary nurse email, monitor serial, admitted days ago
PATIENTS = [
    ("ACM-100231", "Margaret", "Holloway", "F", 78, "4W", "B01", "Acute decompensated heart failure", 4,
     ["Penicillin"], "DNR / DNI", None, (88, 94, 20, 132, 78), "physician", "nurse", "VX5-1001", 3),
    ("ACM-100458", "James", "Whitaker", "M", 64, "4W", "B02", "NSTEMI, post-PCI day 1", 3,
     [], "Full code", None, (72, 97, 16, 124, 76), "physician", "nurse", "VX5-1002", 1),
    ("ACM-100517", "Aisha", "Rahman", "F", 52, "4W", "B03", "Atrial fibrillation with rapid ventricular response", 4,
     ["Sulfa drugs"], "Full code", None, (104, 96, 18, 118, 72), "physician", "sofia.alvarez", "VX5-1003", 2),
    ("ACM-100602", "Robert", "Castellano", "M", 71, "4W", "B04", "COPD exacerbation", 4,
     ["Latex"], "Full code", None, (92, 90, 20, 138, 84), "hannah.cho", "sofia.alvarez", "VX5-1004", 4),
    ("ACM-100689", "Eleanor", "Park", "F", 45, "4W", "B05", "Syncope — telemetry observation", 2,
     [], "Full code", None, (68, 99, 14, 112, 70), "physician", "nurse", "VX5-1005", 1),
    ("ACM-100744", "Samuel", "Okonkwo", "M", 59, "4W", "B06", "Hypertensive urgency", 3,
     ["ACE inhibitors"], "Full code", None, (82, 97, 16, 166, 98), "hannah.cho", "nurse", "VX5-1006", 2),
    ("ACM-100813", "Lucia", "Fernandes", "F", 83, "4W", "B07", "Community-acquired pneumonia", 3,
     ["Codeine"], "DNR", "Droplet", (96, 94, 20, 128, 74), "hannah.cho", "sofia.alvarez", "VX5-1007", 5),
    ("ACM-100877", "Thomas", "Grant", "M", 67, "4W", "B08", "Post-op CABG, day 3", 3,
     [], "Full code", None, (80, 96, 17, 122, 74), "physician", "sofia.alvarez", "VX5-1008", 3),
    ("ACM-100932", "Nadia", "Petrova", "F", 38, "5E", "B01", "Diabetic ketoacidosis, resolving", 3,
     [], "Full code", None, (98, 98, 20, 116, 72), "hannah.cho", "sofia.alvarez", None, 2),
    ("ACM-101005", "William", "Foster", "M", 55, "5E", "B02", "Cellulitis, left lower leg", 2,
     ["Vancomycin"], "Full code", "Contact", (76, 98, 15, 130, 80), "hannah.cho", "nurse", None, 4),
    ("ACM-101066", "Grace", "Liu", "F", 29, "5E", "B03", "Asthma exacerbation", 3,
     [], "Full code", None, (100, 95, 22, 120, 76), "hannah.cho", "sofia.alvarez", None, 1),
    ("ACM-101120", "Henry", "Adeyemi", "M", 74, "5E", "B05", "Upper GI bleed, hemodynamically stable", 3,
     ["Aspirin"], "Full code", None, (94, 97, 18, 108, 64), "physician", "nurse", None, 2),
]

# serial, model, firmware, battery, asset tag, status, last service days ago, next due in days
MONITORS = [
    ("VX5-1001", "Vigil X5", "5.2.1", 96, "BME-04101", "in_use", 120, 60),
    ("VX5-1002", "Vigil X5", "5.2.1", 88, "BME-04102", "in_use", 95, 85),
    ("VX5-1003", "Vigil X5", "5.2.1", 91, "BME-04103", "in_use", 60, 120),
    ("VX5-1004", "Vigil X5", "5.1.8", 79, "BME-04104", "in_use", 170, 10),
    ("VX5-1005", "Vigil X5", "5.2.1", 84, "BME-04105", "in_use", 30, 150),
    ("VX5-1006", "Vigil X5", "5.2.1", 93, "BME-04106", "in_use", 45, 135),
    ("VX5-1007", "Vigil X5", "5.1.8", 72, "BME-04107", "in_use", 200, -20),
    ("VX5-1008", "Vigil X3 Transport", "3.4.0", 81, "BME-04108", "in_use", 80, 100),
    ("VX5-1009", "Vigil X3 Transport", "3.4.0", 100, "BME-04109", "available", 20, 160),
    ("VX5-1010", "Vigil X5", "5.2.1", 64, "BME-04110", "maintenance", 300, -5),
]

# parameter, warn_low, warn_high, crit_low, crit_high
DEFAULT_THRESHOLDS = [
    ("hr", 50, 120, 40, 140),
    ("spo2", 92, None, 88, None),
    ("rr", 10, 24, 8, 30),
    ("sys", 90, 160, 80, 180),
    ("dia", 50, 100, 40, 110),
]

# Patient-specific overrides set by the attending physician.
PATIENT_THRESHOLDS = [
    ("ACM-100517", "hr", 50, 125, 40, 150),
    ("ACM-100602", "spo2", 88, None, 85, None),
    ("ACM-100744", "sys", 90, 178, 80, 195),
    ("ACM-100744", "dia", 50, 110, 40, 120),
]

DEFAULT_SETTINGS = {
    "hospital_name": "ACME General Hospital",
    "escalation_minutes": 3,
    "ehr_sync_minutes": 15,
    "battery_low_pct": 20,
    "battery_critical_pct": 10,
    "integrations": {"pager": True, "email": True, "ehr": True},
}

SCENARIOS = {
    "normal": {
        "label": "Normal shift",
        "description": "All monitors connected with stable readings. Clears every injected fault.",
        "faults": {},
    },
    "desaturation": {
        "label": "Low oxygen saturation",
        "description": "Two patients desaturate progressively towards SpO₂ 83% with rising heart and respiratory rates.",
        "faults": {"VX5-1002": "desaturation", "VX5-1007": "desaturation"},
    },
    "weak_batteries": {
        "label": "Weak batteries",
        "description": "Three monitors drain quickly, triggering low and critical battery alarms and eventually going offline.",
        "faults": {"VX5-1001": "low_battery", "VX5-1005": "low_battery", "VX5-1008": "low_battery"},
    },
    "sensor_issues": {
        "label": "Sensor issues",
        "description": "ECG leads come off on one monitor and an SpO₂ probe detaches on another.",
        "faults": {"VX5-1003": "sensor", "VX5-1006": "sensor"},
    },
    "connection_loss": {
        "label": "Lost connections",
        "description": "Two monitors stop transmitting to the central station.",
        "faults": {"VX5-1004": "disconnect", "VX5-1008": "disconnect"},
    },
    "busy_shift": {
        "label": "Busy shift (mixed)",
        "description": "A desaturation, a weak battery, a detached sensor and a lost connection at the same time.",
        "faults": {"VX5-1002": "desaturation", "VX5-1005": "low_battery", "VX5-1006": "sensor", "VX5-1008": "disconnect"},
    },
}

# Scripted events used to build two hours of realistic history after a reset:
# tick -> list of (serial, fault)
WARMUP_TICKS = 120
WARMUP_SCHEDULE = {
    30: [("VX5-1007", "desaturation")],
    42: [("VX5-1007", "none")],
    70: [("VX5-1003", "sensor")],
    76: [("VX5-1003", "none")],
    95: [("VX5-1005", "disconnect")],
    99: [("VX5-1005", "none")],
}

SAMPLE_NOTES = [
    ("ACM-100231", "nurse", "assessment", "Bilateral crackles at bases, 2+ pitting edema. Furosemide 40 mg IV given at 06:00. Strict I/O."),
    ("ACM-100458", "physician", "general", "Right radial access site clean, no hematoma. Continue dual antiplatelet therapy. Ambulate this afternoon."),
    ("ACM-100517", "physician", "medication", "Diltiazem infusion titrated to 10 mg/h. HR alarm limit raised to 125 bpm for this patient."),
    ("ACM-100602", "hannah.cho", "assessment", "Chronic hypoxemia — target SpO₂ 88–92%. SpO₂ alarm limits adjusted accordingly."),
    ("ACM-100813", "sofia.alvarez", "handoff", "Droplet precautions. On 2 L nasal cannula. Encourage incentive spirometry hourly."),
    ("ACM-101066", "sofia.alvarez", "general", "Nebulizer q4h. Consider continuous monitoring if work of breathing increases."),
]


def dob_for_age(age: int, today: date) -> date:
    return date(today.year - age, ((age * 7) % 12) + 1, ((age * 11) % 27) + 1)


def service_dates(today: date, last_days_ago: int, next_in_days: int) -> tuple[str, str]:
    return (today - timedelta(days=last_days_ago)).isoformat(), (today + timedelta(days=next_in_days)).isoformat()
