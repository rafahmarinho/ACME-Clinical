from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.errors import Forbidden
from app.core.security import CurrentUser, can_edit_patient_thresholds, can_write_notes, require_clinical, require_roles
from app.schemas.requests import NoteCreate, PatientUpdate, ThresholdList
from app.services import patients as patients_service
from app.services import thresholds as thresholds_service

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("")
def list_patients(
    q: str | None = None,
    ward_id: str | None = None,
    acuity: int | None = Query(default=None, ge=1, le=5),
    monitored: Literal["yes", "no"] | None = None,
    alarm: Literal["any", "critical", "warning"] | None = None,
    sort: Literal["name", "bed", "acuity", "alarms"] = "bed",
    user: CurrentUser = Depends(require_clinical),
):
    return patients_service.list_patients(q=q, ward_id=ward_id, acuity=acuity, monitored=monitored, alarm=alarm, sort=sort)


@router.get("/{patient_id}")
def get_patient(patient_id: str, user: CurrentUser = Depends(require_clinical)):
    return patients_service.get_patient(patient_id)


@router.patch("/{patient_id}")
def update_patient(patient_id: str, body: PatientUpdate, user: CurrentUser = Depends(require_roles("physician", "admin"))):
    return patients_service.update_patient(patient_id, body.model_dump(exclude_unset=True), user)


@router.get("/{patient_id}/readings")
def readings(patient_id: str, hours: float = Query(default=2, ge=0.25, le=48), user: CurrentUser = Depends(require_clinical)):
    return patients_service.readings(patient_id, hours)


@router.get("/{patient_id}/alarms")
def alarms(patient_id: str, user: CurrentUser = Depends(require_clinical)):
    return patients_service.patient_alarms(patient_id)


@router.get("/{patient_id}/notes")
def notes(patient_id: str, user: CurrentUser = Depends(require_clinical)):
    return patients_service.list_notes(patient_id)


@router.post("/{patient_id}/notes", status_code=201)
def add_note(patient_id: str, body: NoteCreate, user: CurrentUser = Depends(require_clinical)):
    if not can_write_notes(user.role):
        raise Forbidden()
    return patients_service.add_note(patient_id, body.category, body.body, user)


@router.get("/{patient_id}/thresholds")
def thresholds(patient_id: str, user: CurrentUser = Depends(require_clinical)):
    return patients_service.effective_thresholds(patient_id)


@router.put("/{patient_id}/thresholds")
def save_thresholds(patient_id: str, body: ThresholdList, user: CurrentUser = Depends(require_clinical)):
    if not can_edit_patient_thresholds(user.role):
        raise Forbidden("Only physicians and administrators can change alarm limits")
    return thresholds_service.save_patient(patient_id, [t.model_dump() for t in body.thresholds], user)


@router.delete("/{patient_id}/thresholds/{parameter}")
def reset_threshold(patient_id: str, parameter: Literal["hr", "spo2", "rr", "sys", "dia"], user: CurrentUser = Depends(require_clinical)):
    if not can_edit_patient_thresholds(user.role):
        raise Forbidden("Only physicians and administrators can change alarm limits")
    return thresholds_service.reset_patient(patient_id, parameter, user)
