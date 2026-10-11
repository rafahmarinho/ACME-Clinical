from fastapi import APIRouter, Depends

from app.core.security import REPORT_KINDS_BY_ROLE, CurrentUser, get_current_user
from app.schemas.requests import ReportCreate, ReportEmail
from app.services import reports as reports_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
def list_reports(user: CurrentUser = Depends(get_current_user)):
    return {"reports": reports_service.list_reports(user), "allowed_kinds": list(REPORT_KINDS_BY_ROLE[user.role])}


@router.post("", status_code=201)
def generate(body: ReportCreate, user: CurrentUser = Depends(get_current_user)):
    return reports_service.generate(body.kind, body.format, body.hours, body.patient_id, body.ward_id, user)


@router.get("/{report_id}")
def get_report(report_id: str, user: CurrentUser = Depends(get_current_user)):
    return reports_service.get_report(report_id, user)


@router.get("/{report_id}/download")
def download(report_id: str, user: CurrentUser = Depends(get_current_user)):
    return reports_service.download_url(report_id, user)


@router.post("/{report_id}/email")
def email(report_id: str, body: ReportEmail, user: CurrentUser = Depends(get_current_user)):
    return reports_service.email_report(report_id, body.recipient, user)
