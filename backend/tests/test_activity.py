"""Tests for the per-entity activity feed (Postgres :5433).

The feed inherits its parent's visibility (same gate as comments/attachments):
a caller who can see the record sees its activity; one who cannot gets 404
(enumeration-safe, BR-002). A company owned by a gestor is invisible to an
unrelated membro, so it exercises the boundary cleanly.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog
from app.models.crm import Company
from app.services import activity_service

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def track() -> Iterator[list[uuid.UUID]]:
    company_ids: list[uuid.UUID] = []
    yield company_ids
    db = SessionLocal()
    try:
        if company_ids:
            db.execute(
                delete(ActivityLog).where(ActivityLog.entity_id.in_(company_ids))
            )
            db.execute(delete(Company).where(Company.id.in_(company_ids)))
            db.commit()
    finally:
        db.close()


def _company_with_activity(owner_id: uuid.UUID, track: list[uuid.UUID]) -> uuid.UUID:
    db = SessionLocal()
    try:
        company = Company(
            name=f"ACME {uuid.uuid4().hex[:8]}",
            status="active",
            owner_id=owner_id,
            created_by=owner_id,
        )
        db.add(company)
        db.flush()
        activity_service.record(
            db,
            entity_type="company",
            entity_id=company.id,
            action="created",
            actor_id=owner_id,
            after={"name": company.name},
        )
        db.commit()
        track.append(company.id)
        return company.id
    finally:
        db.close()


def test_owner_sees_entity_activity_with_actor(client, make_user, track) -> None:
    gestor = make_user(role="gestor")
    company_id = _company_with_activity(gestor.id, track)

    resp = client.get(
        f"{API}/activity",
        params={"entity_type": "company", "entity_id": str(company_id)},
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) == 1
    entry = items[0]
    assert entry["action"] == "created"
    assert entry["actor"]["id"] == str(gestor.id)  # camelCase alias
    assert entry["entityType"] == "company"
    assert entry["after"]["name"].startswith("ACME")


def test_unrelated_membro_cannot_see_activity(client, make_user, track) -> None:
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    company_id = _company_with_activity(gestor.id, track)

    resp = client.get(
        f"{API}/activity",
        params={"entity_type": "company", "entity_id": str(company_id)},
        headers=_auth(_token(client, membro.email)),
    )
    # Parent out of scope → 404, no existence leak.
    assert resp.status_code == 404, resp.text


def test_unknown_entity_type_fails_closed(client, make_user) -> None:
    gestor = make_user(role="gestor")
    resp = client.get(
        f"{API}/activity",
        params={"entity_type": "not_a_type", "entity_id": str(uuid.uuid4())},
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 404, resp.text


def test_activity_requires_auth(client) -> None:
    resp = client.get(
        f"{API}/activity",
        params={"entity_type": "company", "entity_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 401, resp.text
