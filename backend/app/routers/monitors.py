import time
from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.errors import Forbidden, NotFound
from app.core.security import CurrentUser, can_assign_monitors, can_manage_devices, get_current_user
from app.repositories import monitors as monitors_repo
from app.schemas.requests import AssignIn, MaintenanceModeIn
from app.services import devices as devices_service
from app.services import waveform

router = APIRouter(tags=["monitors"])


@router.get("/monitors")
def list_monitors(
    q: str | None = None,
    status: Literal["available", "in_use", "maintenance"] | None = None,
    connection: Literal["connected", "lost"] | None = None,
    battery: Literal["low"] | None = None,
    issue: Literal["any"] | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    return devices_service.list_monitors(user, q=q, status=status, connection=connection, battery=battery, issue=issue)


@router.get("/monitors/{monitor_id}")
def get_monitor(monitor_id: str, user: CurrentUser = Depends(get_current_user)):
    return devices_service.get_monitor(monitor_id, user)


@router.get("/beds/available")
def available_beds(user: CurrentUser = Depends(get_current_user)):
    return devices_service.available_beds()


@router.post("/monitors/{monitor_id}/assign")
def assign(monitor_id: str, body: AssignIn, user: CurrentUser = Depends(get_current_user)):
    if not can_assign_monitors(user.role):
        raise Forbidden("Your role cannot assign monitors")
    return devices_service.assign(monitor_id, body.bed_id, user)


@router.post("/monitors/{monitor_id}/unassign")
def unassign(monitor_id: str, user: CurrentUser = Depends(get_current_user)):
    if not can_assign_monitors(user.role):
        raise Forbidden("Your role cannot assign monitors")
    return devices_service.unassign(monitor_id, user)


@router.post("/monitors/{monitor_id}/maintenance-mode")
def maintenance_mode(monitor_id: str, body: MaintenanceModeIn, user: CurrentUser = Depends(get_current_user)):
    if not can_manage_devices(user.role):
        raise Forbidden("Only biomedical technicians and administrators can change device service status")
    return devices_service.set_maintenance(monitor_id, body.enabled, user)


@router.post("/monitors/{monitor_id}/replace-battery")
def replace_battery(monitor_id: str, user: CurrentUser = Depends(get_current_user)):
    if not can_manage_devices(user.role) and user.role != "nurse":
        raise Forbidden()
    return devices_service.replace_battery(monitor_id, user)


@router.get("/monitors/{monitor_id}/waveform")
def monitor_waveform(
    monitor_id: str,
    start: float | None = None,
    seconds: float = Query(default=6, ge=1, le=12),
    user: CurrentUser = Depends(get_current_user),
):
    m = monitors_repo.get(monitor_id)
    if m is None:
        raise NotFound("Monitor")
    return waveform.for_monitor(m, start if start is not None else time.time(), seconds, ("ecg", "pleth", "resp"))


@router.get("/monitoring/waveforms")
def all_waveforms(
    start: float | None = None,
    seconds: float = Query(default=6, ge=1, le=12),
    user: CurrentUser = Depends(get_current_user),
):
    t0 = start if start is not None else time.time()
    return {m["id"]: waveform.for_monitor(m, t0, seconds) for m in monitors_repo.list_all() if m["status"] == "in_use"}
