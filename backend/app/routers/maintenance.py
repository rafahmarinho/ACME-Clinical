from typing import Literal

from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user, require_roles
from app.schemas.requests import MaintenanceCreate, MaintenanceUpdate
from app.services import maintenance as maintenance_service

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


@router.get("")
def list_records(
    status: Literal["scheduled", "in_progress", "completed", "cancelled"] | None = None,
    monitor_id: str | None = None,
    q: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    return maintenance_service.list_records(status, monitor_id, q)


@router.post("", status_code=201)
def create(body: MaintenanceCreate, user: CurrentUser = Depends(require_roles("biomed", "admin"))):
    return maintenance_service.create(body.to_row(), user)


@router.patch("/{record_id}")
def update(record_id: str, body: MaintenanceUpdate, user: CurrentUser = Depends(require_roles("biomed", "admin"))):
    return maintenance_service.update(record_id, body.to_row(), user)
