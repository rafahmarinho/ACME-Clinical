from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user, require_roles
from app.schemas.requests import ThresholdList
from app.services import thresholds as thresholds_service

router = APIRouter(prefix="/thresholds", tags=["thresholds"])


@router.get("/defaults")
def defaults(user: CurrentUser = Depends(get_current_user)):
    return thresholds_service.defaults()


@router.put("/defaults")
def save_defaults(body: ThresholdList, user: CurrentUser = Depends(require_roles("physician", "admin"))):
    return thresholds_service.save_defaults([t.model_dump() for t in body.thresholds], user)


@router.get("/overrides")
def overrides(user: CurrentUser = Depends(require_roles("nurse", "physician", "admin"))):
    return thresholds_service.overrides()
