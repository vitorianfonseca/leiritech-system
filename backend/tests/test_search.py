"""Integration tests for the global search API (F18) against Postgres (:5433).

Covers grouped multi-entity results, the Membro role-scoping boundary (BR-002 →
out-of-scope rows are never surfaced), the short/empty-query guard, and ILIKE
wildcard-injection neutralization.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.crm import Company, Contact, Interaction, Opportunity, Proposal
from app.models.project import Project
from app.models.task import Task

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
        "interaction": [],
        "task": [],
        "proposal": [],
        "opportunity": [],
        "contact": [],
        "project": [],
        "company": [],
    }
    yield ids
    db = SessionLocal()
    try:
        # FK-safe teardown order (children before parents).
        for model, key in (
            (Interaction, "interaction"),
            (Task, "task"),
            (Proposal, "proposal"),
            (Opportunity, "opportunity"),
            (Contact, "contact"),
            (Project, "project"),
            (Company, "company"),
        ):
            if ids[key]:
                db.execute(delete(model).where(model.id.in_(ids[key])))
        db.commit()
    finally:
        db.close()


def _groups(payload: dict) -> dict[str, list[dict]]:
    return {g["type"]: g["items"] for g in payload["groups"]}


def _ids(items: list[dict]) -> set[str]:
    return {item["id"] for item in items}


def test_search_finds_seeded_entities_across_groups(client, make_user, track):
    """A Gestor (whole-operation view) sees a hit in every entity group."""
    gestor = make_user(role="gestor")
    tok = f"Zqx{uuid.uuid4().hex[:8]}"

    db = SessionLocal()
    try:
        company = Company(name=f"{tok} Company", owner_id=gestor.id)
        db.add(company)
        db.flush()
        track["company"].append(company.id)

        contact = Contact(name=f"{tok} Person", company_id=company.id)
        opp = Opportunity(title=f"{tok} Deal", company_id=company.id, outcome="open")
        project = Project(name=f"{tok} Project", manager_id=gestor.id)
        proposal = Proposal(reference=f"{tok}-REF", company_id=company.id, status="draft")
        db.add_all([contact, opp, project, proposal])
        db.flush()
        track["contact"].append(contact.id)
        track["opportunity"].append(opp.id)
        track["project"].append(project.id)
        track["proposal"].append(proposal.id)

        task = Task(title=f"{tok} Task", project_id=project.id, status="todo")
        interaction = Interaction(
            type="note",
            body=f"{tok} discussed the roadmap",
            company_id=company.id,
            occurred_at=datetime.now(tz=UTC),
            user_id=gestor.id,
        )
        db.add_all([task, interaction])
        db.flush()
        track["task"].append(task.id)
        track["interaction"].append(interaction.id)
        db.commit()
    finally:
        db.close()

    resp = client.get(
        f"{API}/search", params={"q": tok}, headers=_auth(_token(client, gestor.email))
    )
    assert resp.status_code == 200, resp.text
    groups = _groups(resp.json())
    for key in (
        "companies",
        "contacts",
        "opportunities",
        "projects",
        "tasks",
        "proposals",
        "interactions",
    ):
        assert key in groups, f"missing group {key}"
        assert len(groups[key]) >= 1


def test_membro_does_not_see_out_of_scope_entities(client, make_user, track):
    """BR-002: a Membro's search returns only entities they may see."""
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    tok = f"Zqy{uuid.uuid4().hex[:8]}"

    db = SessionLocal()
    try:
        # Visible to the Membro (owner).
        mine_co = Company(name=f"{tok} Mine", owner_id=membro.id)
        # Out of scope for the Membro (owned by the Gestor, no shared project).
        other_co = Company(name=f"{tok} Other", owner_id=gestor.id)
        # Out-of-scope project (managed by the Gestor, Membro not a member).
        other_proj = Project(name=f"{tok} SecretProj", manager_id=gestor.id)
        db.add_all([mine_co, other_co, other_proj])
        db.flush()
        track["company"].extend([mine_co.id, other_co.id])
        track["project"].append(other_proj.id)
        mine_id, other_id, proj_id = mine_co.id, other_co.id, other_proj.id
        db.commit()
    finally:
        db.close()

    # Gestor sees both companies + the project.
    gestor_resp = client.get(
        f"{API}/search", params={"q": tok}, headers=_auth(_token(client, gestor.email))
    )
    assert gestor_resp.status_code == 200
    g_groups = _groups(gestor_resp.json())
    assert {str(mine_id), str(other_id)} <= _ids(g_groups["companies"])
    assert str(proj_id) in _ids(g_groups["projects"])

    # Membro sees only their own company; the out-of-scope rows are absent.
    membro_resp = client.get(
        f"{API}/search", params={"q": tok}, headers=_auth(_token(client, membro.email))
    )
    assert membro_resp.status_code == 200
    m_groups = _groups(membro_resp.json())
    company_ids = _ids(m_groups.get("companies", []))
    assert str(mine_id) in company_ids
    assert str(other_id) not in company_ids
    # The out-of-scope project must not surface at all for the Membro.
    assert str(proj_id) not in _ids(m_groups.get("projects", []))


@pytest.mark.parametrize("q", ["", " ", "z", "  a "])
def test_short_or_empty_query_returns_empty(client, make_user, q):
    """Queries under the minimum length yield a well-formed empty envelope."""
    gestor = make_user(role="gestor")
    resp = client.get(
        f"{API}/search", params={"q": q}, headers=_auth(_token(client, gestor.email))
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["groups"] == []
    assert body["query"] == q.strip()


def test_wildcard_injection_is_neutralized(client, make_user, track):
    """A '%' query is escaped to a literal, so it cannot match everything."""
    gestor = make_user(role="gestor")
    tok = f"Zqw{uuid.uuid4().hex[:8]}"

    db = SessionLocal()
    try:
        company = Company(name=f"{tok} Company", owner_id=gestor.id)
        db.add(company)
        db.flush()
        track["company"].append(company.id)
        company_id = company.id
        db.commit()
    finally:
        db.close()

    headers = _auth(_token(client, gestor.email))

    # Sanity: the token matches its company.
    ok = client.get(f"{API}/search", params={"q": tok}, headers=headers)
    assert str(company_id) in _ids(_groups(ok.json()).get("companies", []))

    # A literal '%%' must NOT behave as a match-all wildcard.
    inj = client.get(f"{API}/search", params={"q": "%%"}, headers=headers)
    assert inj.status_code == 200
    assert str(company_id) not in _ids(_groups(inj.json()).get("companies", []))


def test_types_filter_restricts_groups(client, make_user, track):
    """The optional ?types= filter narrows the searched groups."""
    gestor = make_user(role="gestor")
    tok = f"Zqt{uuid.uuid4().hex[:8]}"

    db = SessionLocal()
    try:
        company = Company(name=f"{tok} Co", owner_id=gestor.id)
        project = Project(name=f"{tok} Proj", manager_id=gestor.id)
        db.add_all([company, project])
        db.flush()
        track["company"].append(company.id)
        track["project"].append(project.id)
        db.commit()
    finally:
        db.close()

    resp = client.get(
        f"{API}/search",
        params={"q": tok, "types": "projects"},
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 200
    keys = {g["type"] for g in resp.json()["groups"]}
    assert keys == {"projects"}


def test_search_requires_authentication(client):
    resp = client.get(f"{API}/search", params={"q": "anything"})
    assert resp.status_code == 401
