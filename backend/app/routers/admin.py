"""Team management and system settings (administrators)."""

from fastapi import APIRouter, Depends

from app.core.errors import BadRequest
from app.core.security import CurrentUser, get_current_user, require_roles
from app.repositories import settings as settings_repo
from app.schemas.requests import SystemSettingsUpdate, TeamInvite, TeamUpdate
from app.services import audit
from app.services import team as team_service
from app.services.seed_data import DEFAULT_SETTINGS

router = APIRouter(tags=["administration"])
admin_only = require_roles("admin")


@router.get("/team")
def team(user: CurrentUser = Depends(get_current_user)):
    members = team_service.list_members() if user.role == "admin" else [
        {k: v for k, v in m.items() if k in ("id", "full_name", "role", "title", "avatar_url", "is_active", "email", "phone")}
        for m in team_service.list_members() if m.get("is_active")
    ]
    return members


@router.post("/team", status_code=201)
def invite(body: TeamInvite, user: CurrentUser = Depends(admin_only)):
    return team_service.invite(body.email, body.full_name, body.role, body.title, user)


@router.patch("/team/{member_id}")
def update_member(member_id: str, body: TeamUpdate, user: CurrentUser = Depends(admin_only)):
    return team_service.update_member(member_id, body.model_dump(exclude_unset=True), user)


@router.get("/settings")
def get_settings(user: CurrentUser = Depends(get_current_user)):
    return {**DEFAULT_SETTINGS, **settings_repo.all_settings()}


@router.put("/settings")
def save_settings(body: SystemSettingsUpdate, user: CurrentUser = Depends(admin_only)):
    values = body.model_dump(exclude_none=True)
    current = {**DEFAULT_SETTINGS, **settings_repo.all_settings()}
    low = values.get("battery_low_pct", current["battery_low_pct"])
    crit = values.get("battery_critical_pct", current["battery_critical_pct"])
    if crit >= low:
        raise BadRequest("The critical battery level must be below the low battery level")
    settings_repo.save(values, user.id)
    audit.log("settings.updated", f"{user.full_name} updated system settings ({', '.join(values)})", actor_id=user.id, data=values)
    return {**DEFAULT_SETTINGS, **settings_repo.all_settings()}
