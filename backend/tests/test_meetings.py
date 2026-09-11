"""Integration tests for the meetings API (WORKFLOW_SPEC §1.9, audit C11)
against the real Postgres (:5433).

Covers the create → held/cancel/no-show/reschedule state machine, the
held → Interaction side effect (§1.9), and the Membro scoping boundary
(BR-002 → 404 for a meeting outside their project scope).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.crm import Company, Interaction, Meeting
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
    ids: dict[str, list[uuid.UUID]] = {"company": [], "meeting": [], "project": []}
    yield ids
    db = SessionLocal()
    try:
        if ids["meeting"]:
            db.execute(delete(Meeting).where(Meeting.id.in_(ids["meeting"])))
        if ids["company"]:
            db.execute(
                delete(Interaction).where(Interaction.company_id.in_(ids["company"]))
            )
            db.execute(delete(Company).where(Company.id.in_(ids["company"])))
        if ids["project"]:
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        db.commit()
    finally:
        db.close()


def _make_company(owner_id: uuid.UUID, track: dict) -> uuid.UUID:
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
        track["company"].append(company.id)
        return company.id
    finally:
        db.close()


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def test_create_and_mark_held_writes_interaction(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    company_id = _make_company(gestor.id, track)

    start = datetime.now(tz=UTC) - timedelta(minutes=5)
    created = client.post(
        f"{API}/meetings",
        json={"title": "Kickoff", "start_at": _iso(start), "company_id": str(company_id)},
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text
    meeting_id = created.json()["id"]
    track["meeting"].append(uuid.UUID(meeting_id))
    assert created.json()["status"] == "scheduled"
    assert created.json()["organizer_id"] == str(gestor.id)

    held = client.post(
        f"{API}/meetings/{meeting_id}/held",
        json={"outcome_note": "Foi bem."},
        headers=_auth(token),
    )
    assert held.status_code == 200, held.text
    assert held.json()["status"] == "held"

    db = SessionLocal()
    try:
        interactions = (
            db.query(Interaction).filter(Interaction.company_id == company_id).all()
        )
        assert any(i.type == "meeting" and i.body == "Foi bem." for i in interactions)
    finally:
        db.close()


def test_held_meeting_is_terminal(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    company_id = _make_company(gestor.id, track)
    start = datetime.now(tz=UTC) - timedelta(minutes=5)
    created = client.post(
        f"{API}/meetings",
        json={"title": "X", "start_at": _iso(start), "company_id": str(company_id)},
        headers=_auth(token),
    )
    meeting_id = created.json()["id"]
    track["meeting"].append(uuid.UUID(meeting_id))
    client.post(f"{API}/meetings/{meeting_id}/held", json={}, headers=_auth(token))

    again = client.post(f"{API}/meetings/{meeting_id}/cancel", headers=_auth(token))
    assert again.status_code == 409, again.text
    assert again.json()["error"]["code"] == "MEETING_HELD"


def test_cancel_then_reschedule(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    company_id = _make_company(gestor.id, track)
    start = datetime.now(tz=UTC) + timedelta(days=1)
    created = client.post(
        f"{API}/meetings",
        json={"title": "X", "start_at": _iso(start), "company_id": str(company_id)},
        headers=_auth(token),
    )
    meeting_id = created.json()["id"]
    track["meeting"].append(uuid.UUID(meeting_id))

    cancelled = client.post(f"{API}/meetings/{meeting_id}/cancel", headers=_auth(token))
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"

    new_start = datetime.now(tz=UTC) + timedelta(days=2)
    rescheduled = client.post(
        f"{API}/meetings/{meeting_id}/reschedule",
        json={"start_at": _iso(new_start)},
        headers=_auth(token),
    )
    assert rescheduled.status_code == 200, rescheduled.text
    assert rescheduled.json()["status"] == "scheduled"


def test_no_show_requires_past_start(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    company_id = _make_company(gestor.id, track)
    future = datetime.now(tz=UTC) + timedelta(days=1)
    created = client.post(
        f"{API}/meetings",
        json={"title": "X", "start_at": _iso(future), "company_id": str(company_id)},
        headers=_auth(token),
    )
    meeting_id = created.json()["id"]
    track["meeting"].append(uuid.UUID(meeting_id))

    resp = client.post(f"{API}/meetings/{meeting_id}/no-show", headers=_auth(token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["error"]["code"] == "MEETING_NOT_YET_STARTED"


def test_membro_scoping(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    token = _token(client, gestor.email)
    company_id = _make_company(gestor.id, track)

    project_resp = client.post(
        f"{API}/projects",
        json={"name": f"P {uuid.uuid4().hex[:6]}", "company_id": str(company_id)},
        headers=_auth(token),
    )
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    track["project"].append(uuid.UUID(project_id))

    db = SessionLocal()
    try:
        db.add(ProjectMember(project_id=uuid.UUID(project_id), user_id=membro.id))
        db.commit()
    finally:
        db.close()

    start = datetime.now(tz=UTC) + timedelta(days=1)
    created = client.post(
        f"{API}/meetings",
        json={"title": "Sprint review", "start_at": _iso(start), "project_id": project_id},
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text
    meeting_id = created.json()["id"]
    track["meeting"].append(uuid.UUID(meeting_id))

    # Member of the linked project: visible.
    member_resp = client.get(
        f"{API}/meetings/{meeting_id}", headers=_auth(_token(client, membro.email))
    )
    assert member_resp.status_code == 200, member_resp.text

    # Unrelated Membro: 404 (enumeration-safe, BR-002).
    outsider = make_user(role="membro")
    outsider_resp = client.get(
        f"{API}/meetings/{meeting_id}", headers=_auth(_token(client, outsider.email))
    )
    assert outsider_resp.status_code == 404, outsider_resp.text


def test_create_requires_at_least_one_link(client, make_user):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    start = datetime.now(tz=UTC) + timedelta(days=1)
    resp = client.post(
        f"{API}/meetings",
        json={"title": "Orphan", "start_at": _iso(start)},
        headers=_auth(token),
    )
    assert resp.status_code == 422, resp.text
