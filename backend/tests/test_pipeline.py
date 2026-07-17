"""Integration tests for the pipeline / opportunities API (F5/F7) against the
real Postgres (:5433).

Covers the happy paths (create, move, win, lose, convert), the key business-rule
guards — próxima-ação required (BR-010), lost-reason required (BR-011), no-revert
(BR-013) — the Membro role-scoping boundary (BR-002 → 404), and the admin gate on
pipeline-stage configuration (BR-012).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog
from app.models.crm import Company, Contact, Opportunity, PipelineStage
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
    ids: dict[str, list[uuid.UUID]] = {
        "project": [],
        "opportunity": [],
        "company": [],
        "contact": [],
        "stage": [],
    }
    yield ids
    db = SessionLocal()
    try:
        entity_ids = ids["opportunity"] + ids["company"] + ids["contact"]
        if entity_ids:
            db.execute(delete(ActivityLog).where(ActivityLog.entity_id.in_(entity_ids)))
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
        if ids["stage"]:
            db.execute(delete(PipelineStage).where(PipelineStage.id.in_(ids["stage"])))
        db.commit()
    finally:
        db.close()


def _add_stage(track: dict, *, order_index: int = 0) -> uuid.UUID:
    db = SessionLocal()
    try:
        stage = PipelineStage(
            name="Qualificação",
            code=f"qual-{uuid.uuid4().hex[:8]}",
            order_index=order_index,
            win_probability=30,
        )
        db.add(stage)
        db.flush()
        sid = stage.id
        db.commit()
        track["stage"].append(sid)
        return sid
    finally:
        db.close()


def _create_company(client: TestClient, token: str, track: dict, **overrides) -> dict:
    body = {"name": f"Acme {uuid.uuid4().hex[:8]}", **overrides}
    resp = client.post(f"{API}/companies", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track["company"].append(uuid.UUID(data["id"]))
    return data


def _create_opportunity(
    client: TestClient, token: str, track: dict, **overrides
) -> dict:
    body = {
        "title": f"Deal {uuid.uuid4().hex[:8]}",
        "next_action": "Ligar ao cliente",
        **overrides,
    }
    resp = client.post(f"{API}/opportunities", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track["opportunity"].append(uuid.UUID(data["id"]))
    return data


def _add_project(
    company_id: uuid.UUID, track: dict, *, member_id: uuid.UUID | None = None
) -> uuid.UUID:
    db = SessionLocal()
    try:
        project = Project(name="P1", company_id=company_id, status="active")
        db.add(project)
        db.flush()
        if member_id is not None:
            db.add(ProjectMember(project_id=project.id, user_id=member_id))
        db.commit()
        track["project"].append(project.id)
        return project.id
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Create / permissions / BR-010 próxima ação at the edge
# --------------------------------------------------------------------------- #
def test_gestor_creates_opportunity(client, make_user, track):
    gestor = make_user(role="gestor")
    data = _create_opportunity(client, _token(client, gestor.email), track)
    assert data["outcome"] == "open"
    assert data["next_action"] == "Ligar ao cliente"
    assert data["archived_at"] is None


def test_create_without_next_action_is_422(client, make_user, track):
    gestor = make_user(role="gestor")
    resp = client.post(
        f"{API}/opportunities",
        json={"title": "No action"},
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_membro_cannot_create_opportunity(client, make_user, track):
    membro = make_user(role="membro")
    resp = client.post(
        f"{API}/opportunities",
        json={"title": "Nope", "next_action": "x"},
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "GESTOR_REQUIRED"


# --------------------------------------------------------------------------- #
# Move (F5)
# --------------------------------------------------------------------------- #
def test_move_updates_stage_and_next_action(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    stage_id = _add_stage(track)
    opp = _create_opportunity(client, token, track)

    resp = client.post(
        f"{API}/opportunities/{opp['id']}/move",
        json={"stage_id": str(stage_id), "next_action": "Enviar proposta"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stage_id"] == str(stage_id)
    assert body["next_action"] == "Enviar proposta"


# --------------------------------------------------------------------------- #
# Lose — BR-011 lost reason required
# --------------------------------------------------------------------------- #
def test_lose_without_reason_is_422(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    opp = _create_opportunity(client, token, track)
    resp = client.post(
        f"{API}/opportunities/{opp['id']}/lose", json={}, headers=_auth(token)
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_lose_with_reason_sets_lost_fields(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    opp = _create_opportunity(client, token, track)
    resp = client.post(
        f"{API}/opportunities/{opp['id']}/lose",
        json={"lost_reason": "Orçamento acima do budget"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["outcome"] == "lost"
    assert body["lost_reason"] == "Orçamento acima do budget"
    assert body["lost_at"] is not None


# --------------------------------------------------------------------------- #
# Win + BR-013 no revert
# --------------------------------------------------------------------------- #
def test_win_then_cannot_be_reclosed_or_moved(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    stage_id = _add_stage(track)
    opp = _create_opportunity(client, token, track)

    won = client.post(f"{API}/opportunities/{opp['id']}/win", headers=_auth(token))
    assert won.status_code == 200, won.text
    assert won.json()["outcome"] == "won"

    # BR-013 — won is committed; losing it again is an illegal transition.
    again = client.post(
        f"{API}/opportunities/{opp['id']}/lose",
        json={"lost_reason": "x"},
        headers=_auth(token),
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "OPPORTUNITY_ALREADY_CLOSED"

    moved = client.post(
        f"{API}/opportunities/{opp['id']}/move",
        json={"stage_id": str(stage_id)},
        headers=_auth(token),
    )
    assert moved.status_code == 409


# --------------------------------------------------------------------------- #
# Convert (F7 / BR-035..038)
# --------------------------------------------------------------------------- #
def test_convert_requires_won(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    opp = _create_opportunity(client, token, track)
    resp = client.post(
        f"{API}/opportunities/{opp['id']}/convert", headers=_auth(token)
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "OPPORTUNITY_NOT_WON"


def test_convert_won_returns_verbal_close_prefill(client, make_user, track):
    admin = make_user(role="admin")
    token = _token(client, admin.email)
    company = _create_company(client, token, track)
    cid = company["id"]

    contact = client.post(
        f"{API}/contacts",
        json={"name": "Helena Vaz", "company_id": cid, "role_title": "Diretora"},
        headers=_auth(token),
    )
    assert contact.status_code == 201, contact.text
    track["contact"].append(uuid.UUID(contact.json()["id"]))

    opp = _create_opportunity(
        client, token, track, company_id=cid, estimated_value=500000
    )
    client.post(f"{API}/opportunities/{opp['id']}/win", headers=_auth(token))

    resp = client.post(
        f"{API}/opportunities/{opp['id']}/convert", headers=_auth(token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["company_id"] == cid
    assert body["company_name"] == company["name"]
    assert body["verbal_close"] is True
    assert body["has_accepted_proposal"] is False
    # No accepted proposal → contracted value falls back to the estimate (BR-035/C1).
    assert body["contracted_value"] == 500000
    assert any(c["name"] == "Helena Vaz" for c in body["contacts"])


# --------------------------------------------------------------------------- #
# BR-002 role scoping
# --------------------------------------------------------------------------- #
def test_membro_get_non_scoped_opportunity_is_404(client, make_user, track):
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    company = _create_company(client, _token(client, admin.email), track)
    opp = _create_opportunity(
        client, _token(client, admin.email), track, company_id=company["id"]
    )
    resp = client.get(
        f"{API}/opportunities/{opp['id']}",
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "OPPORTUNITY_NOT_FOUND"


def test_membro_list_excludes_non_scoped_but_includes_via_project(
    client, make_user, track
):
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    admin_token = _token(client, admin.email)
    company = _create_company(client, admin_token, track)
    cid = uuid.UUID(company["id"])
    opp = _create_opportunity(client, admin_token, track, company_id=str(cid))

    membro_hdr = _auth(_token(client, membro.email))
    before = client.get(f"{API}/opportunities?page_size=100", headers=membro_hdr)
    assert all(o["id"] != opp["id"] for o in before.json()["items"])

    _add_project(cid, track, member_id=membro.id)
    after = client.get(f"{API}/opportunities?page_size=100", headers=membro_hdr)
    assert any(o["id"] == opp["id"] for o in after.json()["items"])


# --------------------------------------------------------------------------- #
# Pipeline stages (BR-012 admin gate)
# --------------------------------------------------------------------------- #
def test_stages_list_visible_to_any_user(client, make_user, track):
    membro = make_user(role="membro")
    _add_stage(track)
    resp = client.get(
        f"{API}/pipeline-stages", headers=_auth(_token(client, membro.email))
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_only_admin_creates_stage(client, make_user, track):
    gestor = make_user(role="gestor")
    admin = make_user(role="admin")

    forbidden = client.post(
        f"{API}/pipeline-stages",
        json={"name": "Nova", "code": f"c-{uuid.uuid4().hex[:8]}"},
        headers=_auth(_token(client, gestor.email)),
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "ADMIN_REQUIRED"

    ok = client.post(
        f"{API}/pipeline-stages",
        json={"name": "Nova", "code": f"c-{uuid.uuid4().hex[:8]}", "win_probability": 50},
        headers=_auth(_token(client, admin.email)),
    )
    assert ok.status_code == 201, ok.text
    track["stage"].append(uuid.UUID(ok.json()["id"]))
