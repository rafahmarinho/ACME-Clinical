import pytest
from fastapi.testclient import TestClient

from app.core import security
from app.db.client import set_db_override
from app.services import demo
from app.services.seed_data import DEMO_USERS
from tests.fake_supabase import FakeSupabase


@pytest.fixture()
def db():
    fake = FakeSupabase()
    set_db_override(fake)
    security._token_cache.clear()
    tokens = {}
    for email, full_name, role, title in DEMO_USERS:
        res = fake.auth.admin.create_user({"email": email, "password": "x", "user_metadata": {"full_name": full_name, "role": role, "title": title}})
        tokens.setdefault(role, res.user.id)
    original = security.verify_token
    security.verify_token = lambda token: (tokens[token], f"{token}@test") if token in tokens else None
    demo.reset()
    yield fake
    security.verify_token = original
    set_db_override(None)


@pytest.fixture()
def client(db):
    from app.main import app

    return TestClient(app)


def auth(role: str) -> dict:
    return {"Authorization": f"Bearer {role}"}
