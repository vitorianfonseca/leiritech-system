"""Ensure the three E2E login identities have a known password (dev only).

Playwright drives the app through the REAL login form, so the suite needs
credentials it can type. This script does NOT create users and does NOT touch
business data: it takes the roles already present in the seeded dev database
(app.database.seed) and sets a deterministic dev password on them.

  Administrador          admin@leiritech.pt
  Gestor (both grants)   beatriz@leiritech.pt   payments_grant + invites_grant
  Membro                 diogo@leiritech.pt     member of 2 seeded projects

Password comes from E2E_PASSWORD (default below). Refuses to run unless
ENVIRONMENT is development/test, so it can never rewrite a real account.

Usage:  backend/.venv/bin/python .../bootstrap_e2e_users.py
Prints one JSON object describing what it resolved, for the Playwright
global setup to consume.
"""

from __future__ import annotations

import json
import os
import sys

from sqlalchemy import select

from app.core import security
from app.core.config import settings
from app.database.session import SessionLocal
from app.models.user import User

PASSWORD = os.getenv("E2E_PASSWORD", "E2ePlaywright!2026")

ROLES = {
    "admin": "admin@leiritech.pt",
    "gestor": "beatriz@leiritech.pt",
    "membro": "diogo@leiritech.pt",
}


def main() -> int:
    env = getattr(settings, "ENVIRONMENT", "development")
    if env not in {"development", "test", "dev", "local"}:
        print(f"refusing to rewrite passwords in ENVIRONMENT={env}", file=sys.stderr)
        return 2

    resolved: dict[str, dict[str, object]] = {}
    pw_hash = security.hash_password(PASSWORD)

    with SessionLocal() as db:
        for role, email in ROLES.items():
            user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if user is None:
                print(f"missing seeded user for role {role}: {email}", file=sys.stderr)
                return 3
            user.password_hash = pw_hash
            user.status = "active"
            resolved[role] = {
                "email": email,
                "name": user.name,
                "role": user.role,
                "paymentsGrant": bool(user.payments_grant),
                "invitesGrant": bool(user.invites_grant),
            }
        db.commit()

    print(json.dumps({"password": PASSWORD, "users": resolved}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
