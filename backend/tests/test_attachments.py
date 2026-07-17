"""Authorization tests for the attachments API (#46) against Postgres (:5433).

Focus: the IDOR guard — an attachment inherits its parent's visibility, so a
caller who cannot see the parent entity may not list, read, or write its
attachments (BR-002). R2 is unconfigured in tests, so the authorization gate is
what these assertions exercise (it runs before any storage check).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.crm import Company

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
    ids: list[uuid.UUID] = []
    yield ids
    db = SessionLocal()
    try:
        if ids:
            db.execute(delete(Company).where(Company.id.in_(ids)))
            db.commit()
    finally:
        db.close()


def _make_company(owner_id: uuid.UUID, track: list[uuid.UUID]) -> uuid.UUID:
    db = SessionLocal()
    try:
        company = Company(
            name=f"ACME {uuid.uuid4().hex[:8]}",
            status="active",
            owner_id=owner_id,
            created_by=owner_id,
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        track.append(company.id)
        return company.id
    finally:
        db.close()


def test_membro_cannot_list_attachments_of_unscoped_company(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    company_id = _make_company(gestor.id, track)

    # Owner (gestor) may list — parent is visible (empty list; no attachments).
    ok = client.get(
        f"{API}/attachments",
        params={"entity_type": "company", "entity_id": str(company_id)},
        headers=_auth(_token(client, gestor.email)),
    )
    assert ok.status_code == 200, ok.text
    assert ok.json() == []

    # Unrelated Membro may NOT — parent is out of scope → 404 (no existence leak).
    denied = client.get(
        f"{API}/attachments",
        params={"entity_type": "company", "entity_id": str(company_id)},
        headers=_auth(_token(client, membro.email)),
    )
    assert denied.status_code == 404, denied.text


def test_download_url_of_unknown_or_missing_attachment_is_404(client, make_user):
    gestor = make_user(role="gestor")
    resp = client.get(
        f"{API}/attachments/{uuid.uuid4()}/download-url",
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 404, resp.text


def test_unknown_entity_type_fails_closed(client, make_user):
    gestor = make_user(role="gestor")
    resp = client.get(
        f"{API}/attachments",
        params={"entity_type": "not_a_real_type", "entity_id": str(uuid.uuid4())},
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 404, resp.text


def test_upload_url_to_unscoped_company_is_forbidden(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    company_id = _make_company(gestor.id, track)

    resp = client.post(
        f"{API}/attachments/upload-url",
        json={
            "entity_type": "company",
            "entity_id": str(company_id),
            "filename": "secret.pdf",
            "content_type": "application/pdf",
            "size_bytes": 1024,
        },
        headers=_auth(_token(client, membro.email)),
    )
    # Blocked by the IDOR guard before any storage work → 404 (enumeration-safe).
    assert resp.status_code == 404, resp.text
