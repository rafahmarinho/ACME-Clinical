"""Authentication and role-based access control.

The web app signs users in with Supabase Auth (email + password) and sends the
access token as ``Authorization: Bearer <jwt>``. The API validates the token
with Supabase Auth and loads the user's profile (role, active flag).
"""

import time
from dataclasses import dataclass
from typing import Callable

import httpx
from fastapi import Depends, Header, HTTPException, status

from app.core.config import get_settings
from app.core.errors import Forbidden
from app.repositories import profiles as profiles_repo

ROLES = ("nurse", "physician", "biomed", "admin")
CLINICAL_ROLES = ("nurse", "physician", "admin")

# token -> (expires_at, user_id, email). Avoids a round trip to Supabase Auth on every request.
_token_cache: dict[str, tuple[float, str, str]] = {}
_CACHE_SECONDS = 60.0

# Tests replace this to skip the network call.
TokenVerifier = Callable[[str], tuple[str, str] | None]


def _verify_with_supabase(token: str) -> tuple[str, str] | None:
    settings = get_settings()
    try:
        resp = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication service unavailable")
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data["id"], data.get("email", "")


verify_token: TokenVerifier = _verify_with_supabase


@dataclass
class CurrentUser:
    id: str
    email: str
    role: str
    full_name: str
    profile: dict

    @property
    def is_clinical(self) -> bool:
        return self.role in CLINICAL_ROLES


def _resolve_token(token: str) -> tuple[str, str]:
    now = time.monotonic()
    cached = _token_cache.get(token)
    if cached and cached[0] > now:
        return cached[1], cached[2]
    result = verify_token(token)
    if result is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")
    if len(_token_cache) > 2000:
        _token_cache.clear()
    _token_cache[token] = (now + _CACHE_SECONDS, result[0], result[1])
    return result


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing access token")
    user_id, email = _resolve_token(authorization.split(" ", 1)[1].strip())
    profile = profiles_repo.get(user_id)
    if profile is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No ACME Clinical profile exists for this account")
    if not profile.get("is_active", True):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated. Contact an administrator.")
    return CurrentUser(
        id=user_id,
        email=profile.get("email") or email,
        role=profile["role"],
        full_name=profile.get("full_name") or email,
        profile=profile,
    )


def require_roles(*roles: str):
    """Dependency factory: allow only the given roles."""

    def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise Forbidden()
        return user

    return checker


def require_clinical(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_clinical:
        raise Forbidden("Patient information is limited to clinical staff")
    return user


# Permission helpers shared by routers and services -----------------------------------

def can_acknowledge(role: str, category: str) -> bool:
    if role in ("nurse", "physician", "admin"):
        return True
    return role == "biomed" and category == "technical"


def can_edit_patient_thresholds(role: str) -> bool:
    return role in ("physician", "admin")


def can_edit_default_thresholds(role: str) -> bool:
    return role in ("physician", "admin")


def can_assign_monitors(role: str) -> bool:
    return role in ("nurse", "biomed", "admin")


def can_manage_devices(role: str) -> bool:
    return role in ("biomed", "admin")


def can_write_notes(role: str) -> bool:
    return role in ("nurse", "physician", "admin")


def can_run_simulation(role: str) -> bool:
    return role in ("admin", "biomed")


REPORT_KINDS_BY_ROLE = {
    "nurse": ("shift_summary", "patient_summary", "alarm_log"),
    "physician": ("shift_summary", "patient_summary", "alarm_log"),
    "biomed": ("device_status", "alarm_log"),
    "admin": ("shift_summary", "patient_summary", "device_status", "alarm_log"),
}
