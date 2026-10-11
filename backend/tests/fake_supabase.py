"""Minimal in-memory stand-in for the supabase-py client used by the repositories.

Supports the subset of the PostgREST query builder the app uses. It exists so
tests exercise the real repository and service code without a database.
"""

import copy
import itertools
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace

IDENTITY_TABLES = {"readings", "events", "integration_messages"}
DEFAULTS = {
    "monitors": {"latest": {}, "fault": "none", "connection": "connected", "sensor_status": "ok", "signal_quality": 100},
    "alarms": {"condition_active": True},
    "maintenance_records": {"status": "scheduled"},
    "events": {"severity": "info", "data": {}},
    "integration_messages": {"status": "delivered"},
    "profiles": {"is_active": True, "preferences": {}},
    "patients": {"status": "admitted", "allergies": []},
    "thresholds": {"enabled": True},
    "sim_state": {"auto_run": False, "tick_seconds": 60, "seed": 2026, "scenario": "normal"},
    "notes": {"category": "general"},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Result:
    data: list


class Query:
    def __init__(self, db: "FakeSupabase", name: str):
        self.db = db
        self.name = name
        self.filters = []
        self.orders = []
        self._limit = None
        self._range = None
        self.op = "select"
        self.payload = None
        self.on_conflict = "id"
        self._negate = False

    # -- builders --------------------------------------------------------------------------
    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def upsert(self, payload, on_conflict: str = "id", **_kwargs):
        self.op, self.payload, self.on_conflict = "upsert", payload, on_conflict
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def _add(self, fn):
        negate, self._negate = self._negate, False
        self.filters.append((lambda r: not fn(r)) if negate else fn)
        return self

    def eq(self, col, val):
        return self._add(lambda r: r.get(col) == val)

    def neq(self, col, val):
        return self._add(lambda r: r.get(col) != val)

    def gt(self, col, val):
        return self._add(lambda r: r.get(col) is not None and r.get(col) > val)

    def gte(self, col, val):
        return self._add(lambda r: r.get(col) is not None and r.get(col) >= val)

    def lt(self, col, val):
        return self._add(lambda r: r.get(col) is not None and r.get(col) < val)

    def lte(self, col, val):
        return self._add(lambda r: r.get(col) is not None and r.get(col) <= val)

    def in_(self, col, vals):
        vals = set(vals)
        return self._add(lambda r: r.get(col) in vals)

    def is_(self, col, val):
        assert val == "null"
        return self._add(lambda r: r.get(col) is None)

    def like(self, col, pattern):
        prefix = pattern.rstrip("%")
        return self._add(lambda r: str(r.get(col) or "").startswith(prefix))

    def order(self, col, desc: bool = False):
        self.orders.append((col, desc))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, a, b):
        self._range = (a, b)
        return self

    # -- execution -------------------------------------------------------------------------
    def _match(self, row):
        return all(f(row) for f in self.filters)

    def execute(self) -> Result:
        rows = self.db.tables.setdefault(self.name, [])
        if self.op == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            out = [self.db._insert(self.name, i) for i in items]
            return Result(copy.deepcopy(out))
        if self.op == "upsert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            keys = [k.strip() for k in self.on_conflict.split(",")]
            out = []
            for item in items:
                existing = next((r for r in rows if all(r.get(k) == item.get(k) for k in keys)), None)
                if existing is not None:
                    existing.update(copy.deepcopy(item))
                    existing["updated_at"] = _now() if "updated_at" in existing else existing.get("updated_at")
                    out.append(existing)
                else:
                    out.append(self.db._insert(self.name, item))
            return Result(copy.deepcopy(out))
        matched = [r for r in rows if self._match(r)]
        if self.op == "update":
            for r in matched:
                r.update(copy.deepcopy(self.payload))
            return Result(copy.deepcopy(matched))
        if self.op == "delete":
            self.db.tables[self.name] = [r for r in rows if not self._match(r)]
            return Result(copy.deepcopy(matched))
        for col, desc in reversed(self.orders):
            matched.sort(key=lambda r: (r.get(col) is None, r.get(col) if r.get(col) is not None else ""), reverse=desc)
        if self._range:
            matched = matched[self._range[0] : self._range[1] + 1]
        if self._limit is not None:
            matched = matched[: self._limit]
        return Result(copy.deepcopy(matched))


class FakeBucket:
    def __init__(self, store: dict, name: str):
        self.store, self.name = store, name

    def upload(self, path, content, options=None):
        self.store[(self.name, path)] = content

    def create_signed_url(self, path, expires):
        return {"signedURL": f"https://storage.test/{self.name}/{path}?token=x"}

    def get_public_url(self, path):
        return f"https://storage.test/public/{self.name}/{path}"

    def remove(self, paths):
        for p in paths:
            self.store.pop((self.name, p), None)


class FakeAuthAdmin:
    def __init__(self, db: "FakeSupabase"):
        self.db = db
        self.users: dict[str, SimpleNamespace] = {}

    def create_user(self, attrs):
        uid = str(uuid.uuid4())
        user = SimpleNamespace(id=uid, email=attrs["email"], last_sign_in_at=None, banned=False)
        self.users[uid] = user
        meta = attrs.get("user_metadata") or {}
        self.db._insert("profiles", {"id": uid, "email": attrs["email"], "full_name": meta.get("full_name", ""),
                                     "role": meta.get("role", "nurse"), "title": meta.get("title")})
        return SimpleNamespace(user=user)

    def update_user_by_id(self, uid, attrs):
        if uid in self.users and "ban_duration" in attrs:
            self.users[uid].banned = attrs["ban_duration"] != "none"

    def list_users(self, page=1, per_page=50):
        users = list(self.users.values())
        return users[(page - 1) * per_page : page * per_page]


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.files: dict = {}
        self._ids = itertools.count(1)
        self.auth = SimpleNamespace(admin=FakeAuthAdmin(self))
        self.storage = SimpleNamespace(from_=lambda name: FakeBucket(self.files, name))

    def table(self, name):
        return Query(self, name)

    def rpc(self, fn, params):
        assert fn == "acme_reset_demo"
        for t in ("readings", "alarms", "notes", "maintenance_records", "events", "monitor_assignments", "reports",
                  "integration_messages", "thresholds", "monitors", "patients", "beds", "wards"):
            self.tables[t] = []
        return SimpleNamespace(execute=lambda: Result([]))

    def _insert(self, name, item):
        row = {**DEFAULTS.get(name, {}), **copy.deepcopy(item)}
        if name in IDENTITY_TABLES:
            row["id"] = next(self._ids)
        else:
            row.setdefault("id", str(uuid.uuid4()))
        row.setdefault("created_at", _now())
        if name in ("profiles", "patients", "monitors", "maintenance_records", "sim_state"):
            row.setdefault("updated_at", _now())
        self.tables.setdefault(name, []).append(row)
        return row
