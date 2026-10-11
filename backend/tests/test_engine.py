from app.services.engine import evaluate_parameter, sensor_kind
from app.services.waveform import FS, ecg, pleth

DEFAULT_SPO2 = {"parameter": "spo2", "warn_low": 92, "warn_high": None, "crit_low": 88, "crit_high": None, "enabled": True}
DEFAULT_HR = {"parameter": "hr", "warn_low": 50, "warn_high": 120, "crit_low": 40, "crit_high": 140, "enabled": True}


def test_parameter_severity_levels():
    assert evaluate_parameter("spo2", 96, DEFAULT_SPO2, set()) is None
    warn = evaluate_parameter("spo2", 90, DEFAULT_SPO2, set())
    assert warn.type == "spo2_low" and warn.severity == "warning"
    crit = evaluate_parameter("spo2", 85, DEFAULT_SPO2, set())
    assert crit.severity == "critical" and crit.limit == 88
    high = evaluate_parameter("hr", 150, DEFAULT_HR, set())
    assert high.type == "hr_high" and high.severity == "critical"


def test_hysteresis_keeps_open_alarm_until_clear_margin():
    # 92 is inside limits for a new evaluation...
    assert evaluate_parameter("spo2", 92, DEFAULT_SPO2, set()) is None
    # ...but an open low-SpO2 alarm needs 93 (limit + 1) before it can clear.
    assert evaluate_parameter("spo2", 92, DEFAULT_SPO2, {"spo2_low"}) is not None
    assert evaluate_parameter("spo2", 93, DEFAULT_SPO2, {"spo2_low"}) is None


def test_disabled_threshold_never_alarms():
    assert evaluate_parameter("hr", 200, {**DEFAULT_HR, "enabled": False}, set()) is None


def test_sensor_kind_is_stable_per_device():
    assert sensor_kind("VX5-1003") == "ecg_leads_off"
    assert sensor_kind("VX5-1006") == "spo2_probe_off"


def test_waveforms_are_continuous_and_deterministic():
    a = ecg(100.0, 2, 75, "VX5-1001")
    b = ecg(100.0, 2, 75, "VX5-1001")
    assert a == b and len(a) == 2 * FS
    assert max(a) > 0.8  # R peaks present
    flat = ecg(100.0, 2, 75, "VX5-1001", leads_off=True)
    assert max(abs(v) for v in flat) < 0.1
    assert set(pleth(100.0, 1, 75, "VX5-1001", probe_off=True)) == {0.0}
