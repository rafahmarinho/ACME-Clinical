import secrets
import string

from app.core.config import get_settings
from app.core.errors import BadRequest, NotFound
from app.core.security import CurrentUser
from app.repositories import auth_admin
from app.repositories import profiles as profiles_repo
from app.services import audit

ROLE_LABELS = {"nurse": "Nurse", "physician": "Physician", "biomed": "Biomedical technician", "admin": "Administrator"}


def _last_sign_ins() -> dict[str, str | None]:
    try:
        return {u.id: (u.last_sign_in_at.isoformat() if getattr(u, "last_sign_in_at", None) else None) for u in auth_admin.list_users()}
    except Exception:
        return {}


def list_members() -> list[dict]:
    signins = _last_sign_ins()
    return [{**p, "last_sign_in_at": signins.get(p["id"])} for p in profiles_repo.list_all()]


def _temp_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Acme-" + "".join(secrets.choice(alphabet) for _ in range(10)) + "!"


def invite(email: str, full_name: str, role: str, title: str | None, user: CurrentUser) -> dict:
    email = email.strip().lower()
    if any((p.get("email") or "").lower() == email for p in profiles_repo.list_all()):
        raise BadRequest("A team member with this email already exists")
    password = _temp_password()
    try:
        user_id = auth_admin.create_user(email, password, {"full_name": full_name, "role": role, "title": title})
    except Exception as exc:  # Supabase returns a descriptive message (e.g. weak password, invalid email)
        raise BadRequest(f"Could not create the account: {exc}")
    profile = profiles_repo.get(user_id) or {}
    # The DB trigger creates the profile; make sure role/title match the invitation.
    profile = profiles_repo.update(user_id, {"full_name": full_name, "role": role, "title": title}) or profile
    login_url = get_settings().frontend_url.rstrip("/") + "/login"
    audit.send_message("email", email, "You have been added to ACME Clinical",
                       f"Hello {full_name},\n\n{user.full_name} added you to ACME Clinical as {ROLE_LABELS[role]}.\n"
                       f"Sign in at {login_url} with the temporary password provided by your administrator, "
                       f"then change it from your profile page.", "profile", user_id)
    audit.log("team.invited", f"{user.full_name} added {full_name} ({ROLE_LABELS[role]})", actor_id=user.id,
              entity_type="profile", entity_id=user_id)
    return {"member": profile, "temporary_password": password}


def update_member(member_id: str, values: dict, user: CurrentUser) -> dict:
    member = profiles_repo.get(member_id)
    if member is None:
        raise NotFound("Team member")
    if member_id == user.id and (values.get("role", member["role"]) != member["role"] or values.get("is_active") is False):
        raise BadRequest("You cannot change your own role or deactivate your own account")
    if not values:
        raise BadRequest("Nothing to update")
    updated = profiles_repo.update(member_id, values)
    if "is_active" in values and values["is_active"] != member["is_active"]:
        try:
            auth_admin.set_banned(member_id, not values["is_active"])
        except Exception:
            pass  # the API also blocks inactive profiles, so a failed ban is not fatal
    changes = []
    if "role" in values and values["role"] != member["role"]:
        changes.append(f"role {ROLE_LABELS[member['role']]} → {ROLE_LABELS[values['role']]}")
    if "is_active" in values and values["is_active"] != member["is_active"]:
        changes.append("reactivated" if values["is_active"] else "deactivated")
    if "title" in values and values["title"] != member.get("title"):
        changes.append("title updated")
    audit.log("team.updated", f"{user.full_name} updated {member['full_name']}: {', '.join(changes) or 'no changes'}",
              actor_id=user.id, entity_type="profile", entity_id=member_id)
    return updated
