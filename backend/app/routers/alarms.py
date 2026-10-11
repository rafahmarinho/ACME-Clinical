from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.security import CurrentUser, get_current_user
from app.schemas.requests import AcknowledgeIn
from app.services import alarms as alarms_service

router = APIRouter(prefix="/alarms", tags=["alarms"])


@router.get("")
def list_alarms(
    status: Literal["active", "acknowledged", "open", "resolved", "all"] = "open",
    severity: Literal["critical", "warning", "advisory"] | None = None,
    category: Literal["clinical", "technical"] | None = None,
    ward_id: str | None = None,
    q: str | None = None,
    patient_id: str | None = None,
    monitor_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    user: CurrentUser = Depends(get_current_user),
):
    return alarms_service.list_alarms(user, status=status, severity=severity, category=category, ward_id=ward_id, q=q,
                                      patient_id=patient_id, monitor_id=monitor_id, limit=limit)


@router.get("/summary")
def summary(user: CurrentUser = Depends(get_current_user)):
    return alarms_service.summary(user)


@router.post("/{alarm_id}/acknowledge")
def acknowledge(alarm_id: str, body: AcknowledgeIn, user: CurrentUser = Depends(get_current_user)):
    return alarms_service.acknowledge(alarm_id, user, body.note)
