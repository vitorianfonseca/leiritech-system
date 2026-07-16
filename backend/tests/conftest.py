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

from app.api.routes.auth import login_rate_limiter
from app.core import security
from app.database.session import SessionLocal
from app.main import app
from app.models.user import User


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> None:
    login_rate_limiter.reset()


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
