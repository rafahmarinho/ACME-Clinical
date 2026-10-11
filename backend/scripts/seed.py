"""Create the demo accounts and load the demo dataset.

Usage (from the backend folder, with backend/.env configured):

    python -m scripts.seed

Safe to run more than once: existing accounts are kept (their password and
role are refreshed) and the clinical data is reset to the initial scenario.
"""

import sys

from app.core.config import get_settings
from app.db.client import get_db
from app.repositories import profiles as profiles_repo
from app.services import demo
from app.services.seed_data import DEMO_USERS


def ensure_users() -> None:
    settings = get_settings()
    db = get_db()
    existing = {}
    page = 1
    while True:
        batch = db.auth.admin.list_users(page=page, per_page=200)
        existing.update({u.email: u for u in batch})
        if len(batch) < 200:
            break
        page += 1

    for email, full_name, role, title in DEMO_USERS:
        meta = {"full_name": full_name, "role": role, "title": title}
        if email in existing:
            user_id = existing[email].id
            db.auth.admin.update_user_by_id(user_id, {"password": settings.demo_password, "user_metadata": meta, "ban_duration": "none"})
            action = "updated"
        else:
            res = db.auth.admin.create_user({"email": email, "password": settings.demo_password, "email_confirm": True, "user_metadata": meta})
            user_id = res.user.id
            action = "created"
        # The database trigger creates the profile; keep it aligned with the demo definition.
        if profiles_repo.get(user_id) is None:
            db.table("profiles").insert({"id": user_id, "email": email, "full_name": full_name, "role": role, "title": title}).execute()
        else:
            profiles_repo.update(user_id, {"full_name": full_name, "role": role, "title": title, "is_active": True})
        print(f"  {action:<8} {role:<10} {email}")


def main() -> int:
    print("ACME Clinical — seeding demo data")
    print("Accounts:")
    ensure_users()
    print("Clinical data:")
    result = demo.reset()
    print(f"  {result['patients']} patients, {result['monitors']} monitors, {result['readings']} readings, "
          f"{result['alarms']} historical alarms (simulation tick {result['tick']})")
    print(f"Done. Sign in with any demo account and the password from DEMO_PASSWORD.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
