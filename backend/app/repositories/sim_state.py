from app.repositories.base import first, table


def get() -> dict | None:
    return first(table("sim_state").select("*").eq("id", 1))


def save(values: dict) -> dict:
    return table("sim_state").upsert({"id": 1, **values}, on_conflict="id").execute().data[0]


def update(values: dict) -> dict | None:
    data = table("sim_state").update(values).eq("id", 1).execute().data
    return data[0] if data else None


def claim(expected_tick: int, values: dict) -> dict | None:
    """Optimistic lock: only update if nobody advanced the simulation meanwhile."""
    data = table("sim_state").update(values).eq("id", 1).eq("tick", expected_tick).execute().data
    return data[0] if data else None
