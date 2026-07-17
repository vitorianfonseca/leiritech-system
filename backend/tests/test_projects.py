"""Integration tests for the projects API (F8/F9) against the real Postgres
(:5433).

Covers the happy paths (create, start, template instantiation, spin-up from a won
opportunity), the lifecycle state-machine guards (illegal transition → 409, start
prerequisites → 422, pause/cancel reason → 422, complete requires phases done),
the health publish rules (BR-030/031 — override needs a reason), the cascade
freeze (BR-053 — running timers stopped on pause/cancel), and the Membro
role-scoping boundary (BR-002 → 404).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog
from app.models.crm import Company, Opportunity
from app.models.project import (
    Project,
    ProjectMember,
    ProjectPhase,
    ProjectTemplate,
    TemplatePhase,
    TemplateTask,
)
from app.models.task import Task
from app.models.time_entry import TimeEntry

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
        "company": [],
        "opportunity": [],
        "template": [],
    }
    yield ids
    db = SessionLocal()
    try:
        if ids["project"]:
            db.execute(
                delete(ActivityLog).where(ActivityLog.entity_id.in_(ids["project"]))
            )
            # Children (members, phases, tasks, payment_milestones, time_entries)
            # cascade on project delete.
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        if ids["opportunity"]:
            db.execute(
                delete(Opportunity).where(Opportunity.id.in_(ids["opportunity"]))
            )
        if ids["company"]:
            db.execute(delete(Company).where(Company.id.in_(ids["company"])))
        if ids["template"]:
            db.execute(
                delete(ProjectTemplate).where(
                    ProjectTemplate.id.in_(ids["template"])
                )
            )
        db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Direct-insert helpers (mirror test_pipeline seeding style)
# --------------------------------------------------------------------------- #
def _create_project(client: TestClient, token: str, track: dict, **overrides) -> dict:
    body = {"name": f"Proj {uuid.uuid4().hex[:8]}", **overrides}
    resp = client.post(f"{API}/projects", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track["project"].append(uuid.UUID(data["id"]))
    return data


def _add_phase(project_id: uuid.UUID, *, status: str = "not_started") -> uuid.UUID:
    db = SessionLocal()
    try:
        phase = ProjectPhase(project_id=project_id, name="Fase 1", status=status)
        db.add(phase)
        db.commit()
        return phase.id
    finally:
        db.close()


def _add_member(project_id: uuid.UUID, user_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        db.add(ProjectMember(project_id=project_id, user_id=user_id))
        db.commit()
    finally:
        db.close()


def _start_timer(project_id: uuid.UUID, user_id: uuid.UUID) -> uuid.UUID:
    """Create a task on the project with a running timer; returns the entry id."""
    db = SessionLocal()
    try:
        task = Task(project_id=project_id, title="T", status="in_progress")
        db.add(task)
        db.flush()
        entry = TimeEntry(
            user_id=user_id,
            task_id=task.id,
            started_at=datetime.now(tz=UTC),
            ended_at=None,
        )
        db.add(entry)
        db.commit()
        return entry.id
    finally:
        db.close()


def _timer_running(entry_id: uuid.UUID) -> bool:
    db = SessionLocal()
    try:
        entry = db.get(TimeEntry, entry_id)
        return entry is not None and entry.ended_at is None
    finally:
        db.close()


def _set_suggested_health(project_id: uuid.UUID, value: str) -> None:
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        project.suggested_health = value
        db.commit()
    finally:
        db.close()


def _force_status(project_id: uuid.UUID, status: str) -> None:
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        project.status = status
        db.commit()
    finally:
        db.close()


def _add_template(track: dict) -> uuid.UUID:
    db = SessionLocal()
    try:
        template = ProjectTemplate(name=f"Tpl {uuid.uuid4().hex[:6]}")
        db.add(template)
        db.flush()
        phase = TemplatePhase(
            template_id=template.id, name="Descoberta", order_index=0,
            expected_duration=5,
        )
        db.add(phase)
        db.flush()
        db.add(
            TemplateTask(
                template_phase_id=phase.id, title="Kickoff", order_index=0,
                estimate_hours=4,
            )
        )
        tid = template.id
        db.commit()
        track["template"].append(tid)
        return tid
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Create + permissions
# --------------------------------------------------------------------------- #
def test_gestor_creates_project(client, make_user, track):
    gestor = make_user(role="gestor")
    data = _create_project(client, _token(client, gestor.email), track)
    assert data["status"] == "planning"
    assert data["manager_id"] == str(gestor.id)  # defaults to creator
    assert data["archived_at"] is None


def test_membro_cannot_create_project(client, make_user, track):
    membro = make_user(role="membro")
    resp = client.post(
        f"{API}/projects",
        json={"name": "Nope"},
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "GESTOR_REQUIRED"


# --------------------------------------------------------------------------- #
# Lifecycle — start prerequisites (BR-037/H5) + state machine (§1.3)
# --------------------------------------------------------------------------- #
def test_start_requires_phase_and_member(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    pid = uuid.UUID(proj["id"])

    blocked = client.post(f"{API}/projects/{pid}/start", headers=_auth(token))
    assert blocked.status_code == 422
    body = blocked.json()["error"]
    assert body["code"] == "PROJECT_START_REQUIREMENTS"
    assert "phase" in body["details"]["missing"]
    assert "member" in body["details"]["missing"]

    _add_phase(pid)
    _add_member(pid, gestor.id)
    ok = client.post(f"{API}/projects/{pid}/start", headers=_auth(token))
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "active"


def test_illegal_transition_is_409(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    # planning → completed is not a legal edge.
    resp = client.post(f"{API}/projects/{proj['id']}/complete", headers=_auth(token))
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "PROJECT_INVALID_TRANSITION"


def test_pause_requires_reason_and_stops_timers(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    pid = uuid.UUID(proj["id"])
    _add_phase(pid)
    _add_member(pid, gestor.id)
    client.post(f"{API}/projects/{pid}/start", headers=_auth(token))

    entry_id = _start_timer(pid, gestor.id)
    assert _timer_running(entry_id)

    no_reason = client.post(f"{API}/projects/{pid}/pause", headers=_auth(token))
    assert no_reason.status_code == 422
    assert no_reason.json()["error"]["code"] == "PROJECT_REASON_REQUIRED"

    paused = client.post(
        f"{API}/projects/{pid}/pause",
        json={"reason": "Cliente pediu pausa"},
        headers=_auth(token),
    )
    assert paused.status_code == 200, paused.text
    assert paused.json()["status"] == "on_hold"
    assert paused.json()["status_reason"] == "Cliente pediu pausa"
    # BR-053/BR-042 — the running timer was stopped by the cascade.
    assert not _timer_running(entry_id)


def test_cancel_cascade_stops_timers(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    pid = uuid.UUID(proj["id"])
    entry_id = _start_timer(pid, gestor.id)

    cancelled = client.post(
        f"{API}/projects/{pid}/cancel",
        json={"reason": "Deal caiu"},
        headers=_auth(token),
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert not _timer_running(entry_id)


def test_complete_requires_all_phases_completed(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    pid = uuid.UUID(proj["id"])
    phase_id = _add_phase(pid, status="in_progress")
    _add_member(pid, gestor.id)
    client.post(f"{API}/projects/{pid}/start", headers=_auth(token))

    blocked = client.post(f"{API}/projects/{pid}/complete", headers=_auth(token))
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "PROJECT_PHASES_INCOMPLETE"

    db = SessionLocal()
    try:
        db.get(ProjectPhase, phase_id).status = "completed"
        db.commit()
    finally:
        db.close()

    done = client.post(f"{API}/projects/{pid}/complete", headers=_auth(token))
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed"


# --------------------------------------------------------------------------- #
# Health (BR-030..032)
# --------------------------------------------------------------------------- #
def test_health_publish_override_requires_reason(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    pid = uuid.UUID(proj["id"])
    _set_suggested_health(pid, "healthy")

    # Publishing a value different from the suggestion without a reason → 422.
    no_reason = client.post(
        f"{API}/projects/{pid}/health",
        json={"health": "at_risk"},
        headers=_auth(token),
    )
    assert no_reason.status_code == 422
    assert no_reason.json()["error"]["code"] == "PROJECT_HEALTH_REASON_REQUIRED"

    ok = client.post(
        f"{API}/projects/{pid}/health",
        json={"health": "at_risk", "reason": "Atraso crítico no fornecedor"},
        headers=_auth(token),
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["published_health"] == "at_risk"
    assert ok.json()["health_reason"] == "Atraso crítico no fornecedor"


def test_health_publish_matching_suggestion_needs_no_reason(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    pid = uuid.UUID(proj["id"])
    _set_suggested_health(pid, "attention")

    ok = client.post(
        f"{API}/projects/{pid}/health",
        json={"health": "attention"},
        headers=_auth(token),
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["published_health"] == "attention"
    assert ok.json()["health_reason"] is None


def test_health_not_live_is_409(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    pid = uuid.UUID(proj["id"])
    _force_status(pid, "cancelled")

    resp = client.post(
        f"{API}/projects/{pid}/health",
        json={"health": "healthy"},
        headers=_auth(token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "PROJECT_HEALTH_NOT_LIVE"


def test_get_health_returns_suggested_and_published(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proj = _create_project(client, token, track)
    pid = uuid.UUID(proj["id"])
    _set_suggested_health(pid, "healthy")
    client.post(
        f"{API}/projects/{pid}/health",
        json={"health": "healthy"},
        headers=_auth(token),
    )
    resp = client.get(f"{API}/projects/{pid}/health", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["suggested_health"] == "healthy"
    assert body["published_health"] == "healthy"
    assert body["project_id"] == str(pid)


# --------------------------------------------------------------------------- #
# BR-002 role scoping
# --------------------------------------------------------------------------- #
def test_membro_get_non_scoped_project_is_404(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    proj = _create_project(client, _token(client, gestor.email), track)
    resp = client.get(
        f"{API}/projects/{proj['id']}",
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "PROJECT_NOT_FOUND"


def test_membro_list_only_scoped_projects(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    proj = _create_project(client, _token(client, gestor.email), track)
    pid = uuid.UUID(proj["id"])

    membro_hdr = _auth(_token(client, membro.email))
    before = client.get(f"{API}/projects?page_size=100", headers=membro_hdr)
    assert all(p["id"] != proj["id"] for p in before.json()["items"])

    _add_member(pid, membro.id)
    after = client.get(f"{API}/projects?page_size=100", headers=membro_hdr)
    assert any(p["id"] == proj["id"] for p in after.json()["items"])


# --------------------------------------------------------------------------- #
# Templates (F9)
# --------------------------------------------------------------------------- #
def test_only_admin_creates_template(client, make_user, track):
    gestor = make_user(role="gestor")
    forbidden = client.post(
        f"{API}/projects/templates",
        json={"name": "Website"},
        headers=_auth(_token(client, gestor.email)),
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "ADMIN_REQUIRED"


def test_create_from_template_instantiates_phases_and_tasks(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    template_id = _add_template(track)

    resp = client.post(
        f"{API}/projects/from-template",
        json={
            "template_id": str(template_id),
            "name": "Novo site",
            "start_date": "2026-08-01",
        },
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    pid = uuid.UUID(resp.json()["id"])
    track["project"].append(pid)

    db = SessionLocal()
    try:
        phases = list(
            db.execute(
                ProjectPhase.__table__.select().where(
                    ProjectPhase.project_id == pid
                )
            )
        )
        tasks = list(
            db.execute(Task.__table__.select().where(Task.project_id == pid))
        )
    finally:
        db.close()
    assert len(phases) == 1
    assert len(tasks) == 1


# --------------------------------------------------------------------------- #
# Won → project spin-up (F7 / BR-035..038)
# --------------------------------------------------------------------------- #
def test_from_opportunity_requires_won(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    # Create an open opportunity via its API.
    opp = client.post(
        f"{API}/opportunities",
        json={"title": "Deal", "next_action": "Ligar"},
        headers=_auth(token),
    )
    assert opp.status_code == 201, opp.text
    oid = uuid.UUID(opp.json()["id"])
    track["opportunity"].append(oid)

    resp = client.post(
        f"{API}/projects/from-opportunity",
        json={"opportunity_id": str(oid), "name": "Projeto"},
        headers=_auth(token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "OPPORTUNITY_NOT_WON"


def test_from_opportunity_consumes_prefill(client, make_user, track):
    admin = make_user(role="admin")
    token = _token(client, admin.email)

    company = client.post(
        f"{API}/companies",
        json={"name": f"Acme {uuid.uuid4().hex[:6]}"},
        headers=_auth(token),
    )
    assert company.status_code == 201, company.text
    cid = uuid.UUID(company.json()["id"])
    track["company"].append(cid)

    opp = client.post(
        f"{API}/opportunities",
        json={
            "title": "Deal ganho",
            "next_action": "Fechar",
            "company_id": str(cid),
            "estimated_value": 750000,
        },
        headers=_auth(token),
    )
    oid = uuid.UUID(opp.json()["id"])
    track["opportunity"].append(oid)
    client.post(f"{API}/opportunities/{oid}/win", headers=_auth(token))

    resp = client.post(
        f"{API}/projects/from-opportunity",
        json={"opportunity_id": str(oid), "name": "Entrega Acme"},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    track["project"].append(uuid.UUID(body["id"]))
    assert body["company_id"] == str(cid)
    assert body["opportunity_id"] == str(oid)
    assert body["status"] == "planning"
    # Verbal close (no accepted proposal) → contracted value falls back to the
    # opportunity estimate (BR-035/C1).
    assert body["contracted_value"] == 750000

    # BR-038 — the linked company became an active client.
    db = SessionLocal()
    try:
        assert db.get(Company, cid).status == "active"
    finally:
        db.close()
