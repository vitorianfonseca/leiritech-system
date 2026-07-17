"""Integration tests for the CRM API against the real Postgres (:5433).

Covers the role-scoping boundary (BR-002 → 404 for a Membro), the archive block
(BR-062 → 409), soft-delete (BR-060), the derived cliente-ativo flag (BR-038)
and the interaction timeline + audit trail (BR-064).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog
from app.models.crm import Company, Contact, Opportunity
from app.models.project import Project, ProjectMember

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def track() -> Iterator[dict[str, list[uuid.UUID]]]:
    """Collect ids created during a test and tear them down afterwards."""
    ids: dict[str, list[uuid.UUID]] = {
        "project": [],
        "opportunity": [],
        "company": [],
        "contact": [],
        "activity_entity": [],
    }
    yield ids
    db = SessionLocal()
    try:
        if ids["project"]:
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        if ids["opportunity"]:
            db.execute(
                delete(Opportunity).where(Opportunity.id.in_(ids["opportunity"]))
            )
        if ids["contact"]:
            db.execute(delete(Contact).where(Contact.id.in_(ids["contact"])))
        if ids["company"]:
            db.execute(delete(Company).where(Company.id.in_(ids["company"])))
        entity_ids = ids["activity_entity"] + ids["company"] + ids["contact"]
        if entity_ids:
            db.execute(
                delete(ActivityLog).where(ActivityLog.entity_id.in_(entity_ids))
            )
        db.commit()
    finally:
        db.close()


def _create_company(
    client: TestClient, token: str, track: dict, **overrides
) -> dict:
    body = {"name": f"Acme {uuid.uuid4().hex[:8]}", **overrides}
    resp = client.post(f"{API}/companies", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track["company"].append(uuid.UUID(data["id"]))
    return data


def _add_project(company_id: uuid.UUID, track: dict, *, status: str = "active",
                 member_id: uuid.UUID | None = None) -> uuid.UUID:
    db = SessionLocal()
    try:
        project = Project(name="P1", company_id=company_id, status=status)
        db.add(project)
        db.flush()
        if member_id is not None:
            db.add(ProjectMember(project_id=project.id, user_id=member_id))
        db.commit()
        track["project"].append(project.id)
        return project.id
    finally:
        db.close()


def _add_won_opportunity(company_id: uuid.UUID, track: dict) -> uuid.UUID:
    db = SessionLocal()
    try:
        opp = Opportunity(title="Deal", company_id=company_id, outcome="won")
        db.add(opp)
        db.flush()
        oid = opp.id
        db.commit()
        track["opportunity"].append(oid)
        return oid
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Create / permissions
# --------------------------------------------------------------------------- #
def test_gestor_creates_company(client, make_user, track):
    gestor = make_user(role="gestor")
    data = _create_company(client, _token(client, gestor.email), track)
    assert data["status"] == "potential"
    assert data["is_active_client"] is False
    assert data["archived_at"] is None


def test_membro_cannot_create_company(client, make_user, track):
    membro = make_user(role="membro")
    resp = client.post(
        f"{API}/companies",
        json={"name": "Nope"},
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "GESTOR_REQUIRED"


# --------------------------------------------------------------------------- #
# BR-002 scoping
# --------------------------------------------------------------------------- #
def test_admin_sees_company_but_unrelated_membro_does_not(client, make_user, track):
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    company = _create_company(client, _token(client, admin.email), track)
    cid = company["id"]

    admin_hdr = _auth(_token(client, admin.email))
    admin_list = client.get(f"{API}/companies?page_size=100", headers=admin_hdr)
    assert any(c["id"] == cid for c in admin_list.json()["items"])

    membro_hdr = _auth(_token(client, membro.email))
    membro_list = client.get(f"{API}/companies?page_size=100", headers=membro_hdr)
    assert all(c["id"] != cid for c in membro_list.json()["items"])


def test_membro_get_non_scoped_company_is_404_not_403(client, make_user, track):
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    company = _create_company(client, _token(client, admin.email), track)
    resp = client.get(
        f"{API}/companies/{company['id']}", headers=_auth(_token(client, membro.email))
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "COMPANY_NOT_FOUND"


def test_membro_sees_company_via_project_membership(client, make_user, track):
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    company = _create_company(client, _token(client, admin.email), track)
    cid = uuid.UUID(company["id"])
    _add_project(cid, track, status="active", member_id=membro.id)

    resp = client.get(
        f"{API}/companies/{cid}", headers=_auth(_token(client, membro.email))
    )
    assert resp.status_code == 200
    membro_hdr = _auth(_token(client, membro.email))
    listing = client.get(f"{API}/companies?page_size=100", headers=membro_hdr)
    assert any(c["id"] == str(cid) for c in listing.json()["items"])


# --------------------------------------------------------------------------- #
# BR-038 derived flag
# --------------------------------------------------------------------------- #
def test_won_opportunity_marks_active_client(client, make_user, track):
    admin = make_user(role="admin")
    token = _token(client, admin.email)
    company = _create_company(client, token, track)
    cid = uuid.UUID(company["id"])
    _add_won_opportunity(cid, track)

    resp = client.get(f"{API}/companies/{cid}", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["is_active_client"] is True


# --------------------------------------------------------------------------- #
# BR-060 / BR-062 archive
# --------------------------------------------------------------------------- #
def test_archive_clean_company_soft_deletes(client, make_user, track):
    admin = make_user(role="admin")
    token = _token(client, admin.email)
    company = _create_company(client, token, track)
    cid = company["id"]

    resp = client.post(f"{API}/companies/{cid}/archive", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["archived_at"] is not None

    listing = client.get(f"{API}/companies?page_size=100", headers=_auth(token))
    assert all(c["id"] != cid for c in listing.json()["items"])

    with_archived = client.get(
        f"{API}/companies?include_archived=true&page_size=100", headers=_auth(token)
    )
    assert any(c["id"] == cid for c in with_archived.json()["items"])


def test_archive_blocked_by_live_project(client, make_user, track):
    admin = make_user(role="admin")
    token = _token(client, admin.email)
    company = _create_company(client, token, track)
    cid = uuid.UUID(company["id"])
    project_id = _add_project(cid, track, status="active")

    resp = client.post(f"{API}/companies/{cid}/archive", headers=_auth(token))
    assert resp.status_code == 409
    body = resp.json()["error"]
    assert body["code"] == "COMPANY_ARCHIVE_BLOCKED"
    assert str(project_id) in body["details"]["blockers"]["active_projects"]


def test_restore_company(client, make_user, track):
    admin = make_user(role="admin")
    token = _token(client, admin.email)
    company = _create_company(client, token, track)
    cid = company["id"]
    client.post(f"{API}/companies/{cid}/archive", headers=_auth(token))
    resp = client.post(f"{API}/companies/{cid}/restore", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["archived_at"] is None


# --------------------------------------------------------------------------- #
# Interactions + audit
# --------------------------------------------------------------------------- #
def test_log_interaction_appears_in_timeline_and_writes_audit(client, make_user, track):
    admin = make_user(role="admin")
    token = _token(client, admin.email)
    company = _create_company(client, token, track)
    cid = company["id"]

    resp = client.post(
        f"{API}/interactions",
        json={"type": "call", "company_id": cid, "body": "Kickoff call"},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    interaction_id = uuid.UUID(resp.json()["id"])
    track["activity_entity"].append(interaction_id)

    timeline = client.get(
        f"{API}/interactions?company_id={cid}", headers=_auth(token)
    )
    assert timeline.status_code == 200
    assert any(i["id"] == str(interaction_id) for i in timeline.json()["items"])

    db = SessionLocal()
    try:
        log = db.execute(
            select(ActivityLog).where(
                ActivityLog.entity_type == "interaction",
                ActivityLog.entity_id == interaction_id,
            )
        ).scalar_one_or_none()
        assert log is not None
        assert log.action == "interaction.logged"
    finally:
        db.close()


def test_interaction_requires_a_link(client, make_user, track):
    admin = make_user(role="admin")
    resp = client.post(
        f"{API}/interactions",
        json={"type": "note", "body": "orphan"},
        headers=_auth(_token(client, admin.email)),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
