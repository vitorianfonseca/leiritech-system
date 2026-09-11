"""Shared test fixtures. Exercises the real Docker Postgres on :5433.

Each test that needs accounts creates them with unique emails and cleans them up
afterwards, so runs are repeatable and do not depend on seed data.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.api.routes.auth import (
    forgot_password_ip_rate_limiter,
    forgot_password_rate_limiter,
    login_ip_rate_limiter,
    login_rate_limiter,
    reset_password_rate_limiter,
)
from app.api.routes.invitations import (
    accept_invitation_rate_limiter,
    get_invitation_rate_limiter,
)
from app.core import security
from app.core.config import settings
from app.database.session import SessionLocal
from app.main import app
from app.models.user import User

# audit H3: hardcoded test credentials (PASSWORD in every test file) are only
# ever safe against a disposable local/CI database. Refuse to run the suite if
# ENVIRONMENT looks like production, so this can never accidentally execute
# (and seed accounts) against a shared/staging database.
if settings.ENVIRONMENT == "production":
    raise RuntimeError(
        "Refusing to run the test suite with ENVIRONMENT=production — tests use "
        "shared hardcoded credentials and must only ever run against a "
        "disposable local/CI database."
    )


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> None:
    # Reset every process-local rate limiter between tests — each is keyed
    # (partly or wholly) on the constant TestClient IP, so without this their
    # budgets accumulate across the whole suite and later tests spuriously get
    # 429. This resets test state only and does not change the production
    # limits (config is untouched).
    login_rate_limiter.reset()
    login_ip_rate_limiter.reset()
    forgot_password_rate_limiter.reset()
    forgot_password_ip_rate_limiter.reset()
    reset_password_rate_limiter.reset()
    accept_invitation_rate_limiter.reset()
    get_invitation_rate_limiter.reset()


@pytest.fixture
def make_user() -> Iterator[Callable[..., User]]:
    """Factory that inserts a user directly and tracks it for cleanup."""
    created: list[uuid.UUID] = []

    def _make(
        *,
        role: str = "membro",
        password: str = "correct-horse-battery",
        status: str = "active",
        payments_grant: bool = False,
        invites_grant: bool = False,
    ) -> User:
        db = SessionLocal()
        try:
            user = User(
                name=f"Test {role}",
                email=f"{role}-{uuid.uuid4().hex[:12]}@example.com",
                password_hash=security.hash_password(password),
                role=role,
                status=status,
                payments_grant=payments_grant,
                invites_grant=invites_grant,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            created.append(user.id)
            db.expunge(user)
            return user
        finally:
            db.close()

    yield _make

    db = SessionLocal()
    try:
        if created:
            db.execute(delete(User).where(User.id.in_(created)))
            db.commit()
    finally:
        db.close()


@pytest.fixture
def cleanup_emails() -> Iterator[list[str]]:
    """Register emails created *through the API* for post-test deletion."""
    emails: list[str] = []
    yield emails
    db = SessionLocal()
    try:
        if emails:
            db.execute(delete(User).where(User.email.in_([e.lower() for e in emails])))
            db.commit()
    finally:
        db.close()
