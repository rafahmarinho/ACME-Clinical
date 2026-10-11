"""Synthetic waveforms: ECG (lead II), SpO₂ plethysmograph and respiration.

Each heartbeat is modelled as a sum of Gaussian bumps (P, Q, R, S, T). Beat
times are anchored to absolute time, so consecutive chunks requested with
``start = previous start + seconds`` join seamlessly while the rate is stable.
"""

import math
import random

FS = 200  # samples per second

# amplitude (mV), offset from R peak (s), width (s). T-wave offset scales with sqrt(RR).
ECG_WAVES = [
    (0.12, -0.20, 0.025),  # P
    (-0.10, -0.035, 0.010),  # Q
    (1.10, 0.0, 0.011),  # R
    (-0.24, 0.035, 0.011),  # S
]
T_WAVE = (0.30, 0.26, 0.045)


def _beat_times(start: float, end: float, hr: float, seed: str) -> list[float]:
    rr = 60.0 / max(20.0, min(hr, 220.0))
    first = math.floor(start / rr) - 1
    last = math.ceil(end / rr) + 1
    times = []
    for k in range(first, last + 1):
        jitter = random.Random(f"{seed}:{k}").uniform(-0.02, 0.02) * rr  # mild heart-rate variability
        times.append(k * rr + jitter)
    return times


def ecg(start: float, seconds: float, hr: float | None, seed: str, leads_off: bool = False) -> list[float]:
    n = int(seconds * FS)
    noise = random.Random(f"{seed}:noise:{int(start)}")
    if leads_off or hr is None:
        return [round(noise.gauss(0, 0.01), 3) for _ in range(n)]
    rr = 60.0 / hr
    t_amp, t_off, t_w = T_WAVE
    t_off *= math.sqrt(rr)
    beats = _beat_times(start, start + seconds, hr, seed)
    out = []
    bi = 0
    for i in range(n):
        t = start + i / FS
        while bi + 1 < len(beats) and beats[bi + 1] <= t + 0.5 * rr:
            bi += 1
        v = 0.0
        for b in beats[max(0, bi - 1) : bi + 2]:
            d = t - b
            for amp, off, w in ECG_WAVES:
                v += amp * math.exp(-((d - off) ** 2) / (2 * w * w))
            v += t_amp * math.exp(-((d - t_off) ** 2) / (2 * t_w * t_w))
        v += 0.04 * math.sin(2 * math.pi * 0.22 * t) + noise.gauss(0, 0.012)
        out.append(round(v, 3))
    return out


def pleth(start: float, seconds: float, hr: float | None, seed: str, probe_off: bool = False) -> list[float]:
    n = int(seconds * FS)
    if probe_off or hr is None:
        return [0.0] * n
    rr = 60.0 / hr
    beats = _beat_times(start, start + seconds, hr, seed)
    out = []
    bi = 0
    delay = 0.18  # pulse transit delay after the R wave
    for i in range(n):
        t = start + i / FS
        while bi + 1 < len(beats) and beats[bi + 1] + delay <= t:
            bi += 1
        d = t - beats[bi] - delay
        if d < 0:
            d += rr
        v = math.exp(-((d - 0.16 * rr) ** 2) / (2 * (0.075 * rr) ** 2)) + 0.35 * math.exp(
            -((d - 0.45 * rr) ** 2) / (2 * (0.07 * rr) ** 2)
        )
        out.append(round(v, 3))
    return out


def resp(start: float, seconds: float, rr: float | None) -> list[float]:
    n = int(seconds * FS)
    if not rr:
        return [0.0] * n
    f = rr / 60.0
    return [round(math.sin(2 * math.pi * f * (start + i / FS)) * 0.5 + 0.5, 3) for i in range(n)]


def for_monitor(monitor: dict, start: float, seconds: float, channels: tuple[str, ...] = ("ecg", "pleth")) -> dict:
    latest = monitor.get("latest") or {}
    online = monitor.get("connection") == "connected" and monitor.get("status") == "in_use"
    sensor = monitor.get("sensor_status", "ok")
    hr = latest.get("hr")
    # When ECG leads are off the pleth still pulses at the last known rate.
    pulse_rate = hr or (latest.get("hr_last") or 75)
    seed = monitor["serial"]
    data: dict = {"monitor_id": monitor["id"], "fs": FS, "start": start, "seconds": seconds, "online": online}
    if not online:
        for c in channels:
            data[c] = []
        return data
    if "ecg" in channels:
        data["ecg"] = ecg(start, seconds, hr, seed, leads_off=sensor == "ecg_leads_off")
    if "pleth" in channels:
        data["pleth"] = pleth(start, seconds, pulse_rate, seed, probe_off=sensor == "spo2_probe_off")
    if "resp" in channels:
        data["resp"] = resp(start, seconds, latest.get("rr"))
    return data
