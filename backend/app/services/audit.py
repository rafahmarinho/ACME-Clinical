"""Event log for user actions, stamped with the simulation clock."""

from app.repositories import events as events_repo
from app.repositories import integrations as integrations_repo
from app.repositories import settings as settings_repo
from app.repositories import sim_state as sim_repo
from app.services.clock import iso, utcnow


def sim_clock() -> tuple[str, int]:
    state = sim_repo.get()
    if not state:
        return iso(utcnow()), 0
    return state["sim_time"], state["tick"]


def log(kind: str, message: str, *, actor_id: str | None = None, entity_type: str | None = None,
        entity_id: str | None = None, severity: str = "info", data: dict | None = None) -> None:
    sim_time, tick = sim_clock()
    events_repo.add_many([{
        "occurred_at": sim_time,
        "tick": tick,
        "kind": kind,
        "severity": severity,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "message": message,
        "actor_id": actor_id,
        "data": data or {},
    }])


def send_message(channel: str, recipient: str, subject: str, body: str = "", related_type: str | None = None,
                 related_id: str | None = None) -> bool:
    """Simulated outbound integration (pager, email, EHR). Returns False when the channel is disabled."""
    integrations = settings_repo.all_settings().get("integrations") or {}
    if not integrations.get(channel, True):
        return False
    sim_time, _ = sim_clock()
    integrations_repo.add_many([{
        "channel": channel,
        "recipient": recipient,
        "subject": subject,
        "body": body,
        "status": "delivered",
        "related_type": related_type,
        "related_id": related_id,
        "sim_time": sim_time,
    }])
    return True
