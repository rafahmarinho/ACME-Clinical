"""Simulation orchestration: load state, run the engine, persist the results."""

from datetime import timedelta

from app.core.config import get_settings
from app.core.errors import BadRequest, Conflict, NotFound
from app.repositories import alarms as alarms_repo
from app.repositories import events as events_repo
from app.repositories import integrations as integrations_repo
from app.repositories import monitors as monitors_repo
from app.repositories import patients as patients_repo
from app.repositories import profiles as profiles_repo
from app.repositories import readings as readings_repo
from app.repositories import settings as settings_repo
from app.repositories import sim_state as sim_repo
from app.repositories import thresholds as thresholds_repo
from app.repositories import wards as wards_repo
from app.services import audit
from app.services.clock import iso, parse, utcnow
from app.services.engine import EngineResult, SimulationEngine
from app.services.seed_data import DEFAULT_SETTINGS, SCENARIOS

FAULTS = ("none", "desaturation", "low_battery", "sensor", "disconnect")
MAX_TICKS_PER_REQUEST = 240


def get_state() -> dict:
    state = sim_repo.get()
    if state is None:
        raise NotFound("Simulation state (run the seed script first)")
    return state


def build_engine(state: dict) -> SimulationEngine:
    return SimulationEngine(
        state=state,
        monitors=monitors_repo.list_all(),
        patients=patients_repo.list_all(),
        beds=wards_repo.list_beds(),
        thresholds=thresholds_repo.list_all(),
        open_alarms=alarms_repo.active(),
        settings={**DEFAULT_SETTINGS, **settings_repo.all_settings()},
        profiles=profiles_repo.list_all(),
    )


def persist(result: EngineResult) -> None:
    readings_repo.add_many(result.readings)
    monitors_repo.save_many(list(result.monitors.values()))
    alarms_repo.save_many(list(result.alarms.values()))
    events_repo.add_many(result.events)
    integrations_repo.add_many(result.messages)


def summarize(result: EngineResult, ticks: int) -> dict:
    kinds = [e["kind"] for e in result.events]
    return {
        "ticks": ticks,
        "tick": result.tick,
        "sim_time": iso(result.sim_time) if result.sim_time else None,
        "readings": len(result.readings),
        "alarms_raised": kinds.count("alarm.raised"),
        "alarms_resolved": kinds.count("alarm.resolved"),
        "events": len(result.events),
        "messages": len(result.messages),
    }


def advance(ticks: int, actor_id: str | None = None, auto: bool = False) -> dict:
    if not 1 <= ticks <= MAX_TICKS_PER_REQUEST:
        raise BadRequest(f"Ticks must be between 1 and {MAX_TICKS_PER_REQUEST}")
    state = get_state()
    if auto:
        if not state["auto_run"]:
            return {"skipped": True, "reason": "Auto-run is paused", "tick": state["tick"], "sim_time": state["sim_time"]}
        last = parse(state.get("last_tick_at"))
        if last and (utcnow() - last).total_seconds() < get_settings().auto_tick_min_interval:
            return {"skipped": True, "reason": "Ticked recently", "tick": state["tick"], "sim_time": state["sim_time"]}

    new_time = parse(state["sim_time"]) + timedelta(seconds=state["tick_seconds"] * ticks)
    claimed = sim_repo.claim(
        state["tick"], {"tick": state["tick"] + ticks, "sim_time": iso(new_time), "last_tick_at": iso(utcnow())}
    )
    if claimed is None:
        if auto:
            return {"skipped": True, "reason": "Another client advanced the simulation", "tick": state["tick"], "sim_time": state["sim_time"]}
        raise Conflict("The simulation was advanced by someone else at the same time. Please try again.")

    result = build_engine(state).run(ticks)
    persist(result)
    summary = summarize(result, ticks)
    if not auto:
        audit.log(
            "simulation.advanced",
            f"Simulation advanced {ticks} minute{'s' if ticks != 1 else ''} · "
            f"{summary['alarms_raised']} alarms raised, {summary['alarms_resolved']} resolved",
            actor_id=actor_id,
            data=summary,
        )
    return summary


def set_auto_run(enabled: bool, actor_id: str) -> dict:
    get_state()
    state = sim_repo.update({"auto_run": enabled})
    audit.log("simulation.auto_run", f"Auto-run {'started' if enabled else 'paused'}", actor_id=actor_id)
    return state


def apply_scenario(name: str, actor_id: str) -> dict:
    scenario = SCENARIOS.get(name)
    if scenario is None:
        raise BadRequest(f"Unknown scenario '{name}'")
    state = get_state()
    changed = []
    for m in monitors_repo.list_all():
        fault = scenario["faults"].get(m["serial"], "none")
        if m["status"] != "in_use":
            fault = "none"
        updated = dict(m)
        updated["fault"] = fault
        updated["fault_started_tick"] = state["tick"] if fault != "none" else None
        if name == "normal" and m["battery_pct"] < 50:
            updated["battery_pct"] = 100  # fresh batteries for a clean baseline
        if updated != m:
            changed.append(updated)
    monitors_repo.save_many(changed)
    sim_repo.update({"scenario": name})
    affected = [m["serial"] for m in changed if m["fault"] != "none"]
    audit.log(
        "simulation.scenario",
        f"Scenario changed to “{scenario['label']}”" + (f" · affects {', '.join(affected)}" if affected else ""),
        actor_id=actor_id,
        data={"scenario": name, "monitors": affected},
    )
    return advance(1, actor_id=None)


def inject_fault(monitor_id: str, fault: str, actor_id: str) -> dict:
    if fault not in FAULTS:
        raise BadRequest(f"Unknown fault '{fault}'")
    m = monitors_repo.get(monitor_id)
    if m is None:
        raise NotFound("Monitor")
    if fault != "none" and m["status"] != "in_use":
        raise BadRequest("Faults can only be injected into monitors that are assigned to a bed")
    state = get_state()
    monitors_repo.update(monitor_id, {"fault": fault, "fault_started_tick": state["tick"] if fault != "none" else None})
    label = {"none": "cleared all faults", "desaturation": "started a desaturation", "low_battery": "set a weak battery",
             "sensor": "detached a sensor", "disconnect": "cut the network connection"}[fault]
    audit.log("simulation.fault", f"Fault injection on {m['serial']}: {label}", actor_id=actor_id,
              entity_type="monitor", entity_id=monitor_id, data={"fault": fault})
    return advance(1, actor_id=None)


def overview() -> dict:
    state = get_state()
    monitors = monitors_repo.list_all()
    beds = {b["id"]: b for b in wards_repo.list_beds()}
    wards = {w["id"]: w for w in wards_repo.list_wards()}
    rows = []
    for m in monitors:
        bed = beds.get(m.get("bed_id"))
        rows.append({
            "id": m["id"],
            "serial": m["serial"],
            "status": m["status"],
            "connection": m["connection"],
            "sensor_status": m["sensor_status"],
            "battery_pct": m["battery_pct"],
            "fault": m["fault"],
            "bed": f"{wards[bed['ward_id']]['code']}-{bed['label']}" if bed else None,
        })
    return {
        "state": state,
        "scenarios": [{"id": k, **{kk: vv for kk, vv in v.items() if kk != "faults"}, "monitors": list(v["faults"].keys())}
                      for k, v in SCENARIOS.items()],
        "faults": list(FAULTS),
        "monitors": rows,
    }
