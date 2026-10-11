from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.errors import Forbidden
from app.core.security import CurrentUser, can_run_simulation, get_current_user, require_roles
from app.repositories import events as events_repo
from app.repositories import integrations as integrations_repo
from app.schemas.requests import SimAdvance, SimAutoRun, SimFault, SimScenario
from app.services import demo
from app.services import simulation as sim_service
from app.services.context import Lookup
from app.services.overview import NON_CLINICAL_EVENT_PREFIXES

router = APIRouter(prefix="/simulation", tags=["simulation"])


def _operator(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not can_run_simulation(user.role):
        raise Forbidden("Only administrators and biomedical technicians can control the simulation")
    return user


@router.get("")
def overview(user: CurrentUser = Depends(get_current_user)):
    return sim_service.overview()


@router.get("/state")
def state(user: CurrentUser = Depends(get_current_user)):
    return sim_service.get_state()


@router.post("/advance")
def advance(body: SimAdvance, user: CurrentUser = Depends(_operator)):
    return sim_service.advance(body.ticks, actor_id=user.id)


@router.post("/tick")
def auto_tick(user: CurrentUser = Depends(get_current_user)):
    """Called periodically by open browsers while auto-run is on (rate-limited server side)."""
    return sim_service.advance(1, actor_id=None, auto=True)


@router.patch("/auto-run")
def auto_run(body: SimAutoRun, user: CurrentUser = Depends(get_current_user)):
    return sim_service.set_auto_run(body.auto_run, user.id)


@router.post("/scenario")
def scenario(body: SimScenario, user: CurrentUser = Depends(_operator)):
    return sim_service.apply_scenario(body.scenario, user.id)


@router.post("/monitors/{monitor_id}/fault")
def fault(monitor_id: str, body: SimFault, user: CurrentUser = Depends(_operator)):
    return sim_service.inject_fault(monitor_id, body.fault, user.id)


@router.post("/reset")
def reset(user: CurrentUser = Depends(require_roles("admin"))):
    return demo.reset(actor_id=user.id)


@router.get("/events")
def events(
    kind: str | None = Query(default=None, max_length=40),
    severity: Literal["info", "warning", "critical"] | None = None,
    before_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: CurrentUser = Depends(get_current_user),
):
    rows = events_repo.search(kind=kind, severity=severity, before_id=before_id, limit=limit)
    if not user.is_clinical:
        rows = [e for e in rows if e["kind"].startswith(NON_CLINICAL_EVENT_PREFIXES)]
    lk = Lookup(clinical=user.is_clinical)
    return [{**e, "actor": lk.person(e.get("actor_id"))} for e in rows]


@router.get("/integrations")
def integrations(
    channel: Literal["pager", "email", "ehr"] | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: CurrentUser = Depends(require_roles("admin", "biomed")),
):
    return integrations_repo.search(channel=channel, limit=limit)
