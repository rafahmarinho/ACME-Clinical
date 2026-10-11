"""Small helpers shared by the repositories."""

from typing import Any, Callable, Iterable, Iterator

from app.db.client import get_db

PAGE_SIZE = 1000  # PostgREST default max rows per request


def table(name: str):
    return get_db().table(name)


def rows(query) -> list[dict[str, Any]]:
    return query.execute().data or []


def first(query) -> dict[str, Any] | None:
    data = query.limit(1).execute().data
    return data[0] if data else None


def select_all(build: Callable[[], Any]) -> list[dict[str, Any]]:
    """Page through a query that may return more than PAGE_SIZE rows.

    ``build`` must return a fresh, ordered query each time it is called.
    """
    out: list[dict[str, Any]] = []
    start = 0
    while True:
        batch = build().range(start, start + PAGE_SIZE - 1).execute().data or []
        out.extend(batch)
        if len(batch) < PAGE_SIZE:
            return out
        start += PAGE_SIZE


def chunked(items: list, size: int = 500) -> Iterator[list]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def insert_many(name: str, items: Iterable[dict]) -> list[dict]:
    items = list(items)
    out: list[dict] = []
    for chunk in chunked(items):
        out.extend(table(name).insert(chunk).execute().data or [])
    return out


def upsert_many(name: str, items: Iterable[dict], on_conflict: str = "id") -> list[dict]:
    items = list(items)
    out: list[dict] = []
    for chunk in chunked(items):
        out.extend(table(name).upsert(chunk, on_conflict=on_conflict).execute().data or [])
    return out


def by_id(items: Iterable[dict], key: str = "id") -> dict[Any, dict]:
    return {i[key]: i for i in items}
