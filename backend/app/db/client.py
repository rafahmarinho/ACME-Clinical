"""Supabase client factory.

All database access goes through the repositories in ``app.repositories``,
which receive this client. Tests swap it for an in-memory fake.
"""

from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from app.core.config import get_settings

_override: Any = None


@lru_cache
def _create() -> Client:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_db() -> Any:
    """Return the shared service-role client (or a test override)."""
    return _override if _override is not None else _create()


def set_db_override(client: Any) -> None:
    global _override
    _override = client
