"""Integration tests for the financial ops API (F14, BR-065..073) against the
real Postgres (:5433).

Covers the BR-008 financial gate (Membro and Gestor-without-grant → 403; Admin
and Gestor+grant → 200), the payment-milestone create prerequisites (BR-071),
the cancelled/archived-project block (BR-037/BR-053), the §1.7 state machine
(valid transitions, terminal states, reconciliation guards → 409), project-cost
CRUD, and the live-margin computation (BR-065).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog
from app.models.project import Project
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
    ids: dict[str, list[uuid.UUID]] = {"project": [], "audit": []}
    yield ids
    db = SessionLocal()
    try:
        if ids["audit"]:
            db.execute(
                delete(ActivityLog).where(ActivityLog.entity_id.in_(ids["audit"]))
            )
        if ids["project"]:
            # milestones, costs, tasks, time_entries cascade on project delete.
            db.execute(
                delete(ActivityLog).where(ActivityLog.entity_id.in_(ids["project"]))
            )
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        db.commit()
    finally:
        db.close()


def _make_project(
    track: dict,
    *,
    status: str = "active",
    contracted_value: int | None = None,
    internal_cost_rate: int | None = None,
) -> Project:
    db = SessionLocal()
    try:
        project = Project(
            name=f"Fin {uuid.uuid4().hex[:8]}",
            status=status,
            contracted_value=contracted_value,
            internal_cost_rate=internal_cost_rate,
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        track["project"].append(project.id)
        db.expunge(project)
        return project
    finally:
        db.close()


def _seed_hours(project_id: uuid.UUID, user_id: uuid.UUID, hours: float) -> None:
    """Insert a task + one completed time entry of ``hours`` on the project."""
    db = SessionLocal()
    try:
        task = Task(project_id=project_id, title="T", status="todo")
        db.add(task)
        db.flush()
        start = datetime.now(tz=UTC) - timedelta(hours=hours + 1)
        db.add(
            TimeEntry(
                user_id=user_id,
                task_id=task.id,
                started_at=start,
                ended_at=start + timedelta(hours=hours),
                billable=True,
            )
        )
        db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# BR-008 — the financial gate
# --------------------------------------------------------------------------- #
def test_finance_gate_blocks_membro_and_ungranted_gestor(
    client, make_user, track
) -> None:
    admin = make_user(role="admin")
    gestor_grant = make_user(role="gestor", payments_grant=True)
    gestor_plain = make_user(role="gestor", payments_grant=False)
    membro = make_user(role="membro")

    url = f"{API}/finance/payment-milestones"

    assert client.get(url, headers=_auth(_token(client, membro.email))).status_code == 403
    assert (
        client.get(url, headers=_auth(_token(client, gestor_plain.email))).status_code
        == 403
    )
    assert (
        client.get(url, headers=_auth(_token(client, gestor_grant.email))).status_code
        == 200
    )
    assert client.get(url, headers=_auth(_token(client, admin.email))).status_code == 200


def test_finance_gate_missing_auth_is_401(client) -> None:
    assert client.get(f"{API}/finance/payment-milestones").status_code == 401


# --------------------------------------------------------------------------- #
# Milestone create — BR-071 prerequisites + frozen-project block
# --------------------------------------------------------------------------- #
def test_create_milestone_happy_path(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track, contracted_value=100_000)
    token = _token(client, admin.email)

    resp = client.post(
        f"{API}/finance/payment-milestones",
        headers=_auth(token),
        json={
            "project_id": str(project.id),
            "amount": 50_000,
            "expected_date": str(date.today() + timedelta(days=30)),
            "completion_criteria": "Kickoff signed",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "planned"
    assert body["amount"] == 50_000
    track["audit"].append(uuid.UUID(body["id"]))


def test_create_milestone_requires_completion_criteria(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track)
    resp = client.post(
        f"{API}/finance/payment-milestones",
        headers=_auth(_token(client, admin.email)),
        json={
            "project_id": str(project.id),
            "amount": 1000,
            "expected_date": str(date.today()),
        },
    )
    assert resp.status_code == 422, resp.text


def test_create_milestone_blocked_on_cancelled_project(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track, status="cancelled")
    resp = client.post(
        f"{API}/finance/payment-milestones",
        headers=_auth(_token(client, admin.email)),
        json={
            "project_id": str(project.id),
            "amount": 1000,
            "expected_date": str(date.today()),
            "completion_criteria": "x",
        },
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["error"]["code"] == "PROJECT_FROZEN"


# --------------------------------------------------------------------------- #
# §1.7 state machine
# --------------------------------------------------------------------------- #
def _create_milestone(client, token, project_id, amount=10_000, **extra) -> dict:
    resp = client.post(
        f"{API}/finance/payment-milestones",
        headers=_auth(token),
        json={
            "project_id": str(project_id),
            "amount": amount,
            "expected_date": str(date.today() + timedelta(days=15)),
            "completion_criteria": "criteria",
            **extra,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_milestone_invoiced_requires_external_ref_then_paid(
    client, make_user, track
) -> None:
    admin = make_user(role="admin")
    project = _make_project(track)
    token = _token(client, admin.email)
    m = _create_milestone(client, token, project.id, amount=10_000)
    mid = m["id"]

    # invoiced without a reference → 400
    r = client.post(
        f"{API}/finance/payment-milestones/{mid}/status",
        headers=_auth(token),
        json={"status": "invoiced"},
    )
    assert r.status_code == 400, r.text

    # invoiced with a reference → 200
    r = client.post(
        f"{API}/finance/payment-milestones/{mid}/status",
        headers=_auth(token),
        json={"status": "invoiced", "external_invoice_ref": "EXT-2026-001"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "invoiced"
    assert r.json()["invoiced_date"] is not None

    # invoiced → paid (full receipt) → confirmer + paid_date recorded
    r = client.post(
        f"{API}/finance/payment-milestones/{mid}/status",
        headers=_auth(token),
        json={"status": "paid"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "paid"
    assert body["received_amount"] == 10_000
    assert body["confirmer_id"] == str(admin.id)
    assert body["paid_date"] is not None


def test_milestone_paid_is_terminal(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track)
    token = _token(client, admin.email)
    m = _create_milestone(client, token, project.id, amount=5000)
    mid = m["id"]
    assert (
        client.post(
            f"{API}/finance/payment-milestones/{mid}/status",
            headers=_auth(token),
            json={"status": "paid"},
        ).status_code
        == 200
    )
    r = client.post(
        f"{API}/finance/payment-milestones/{mid}/status",
        headers=_auth(token),
        json={"status": "invoiced", "external_invoice_ref": "X"},
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "MILESTONE_PAID_TERMINAL"


def test_milestone_partial_then_illegal_backward(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track)
    token = _token(client, admin.email)
    m = _create_milestone(client, token, project.id, amount=10_000)
    mid = m["id"]

    # planned → partially_paid (0 < received < amount)
    r = client.post(
        f"{API}/finance/payment-milestones/{mid}/status",
        headers=_auth(token),
        json={"status": "partially_paid", "received_amount": 4000},
    )
    assert r.status_code == 200, r.text
    assert r.json()["received_amount"] == 4000

    # partially_paid → invoiced is not a valid transition
    r = client.post(
        f"{API}/finance/payment-milestones/{mid}/status",
        headers=_auth(token),
        json={"status": "invoiced", "external_invoice_ref": "X"},
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "MILESTONE_ILLEGAL_TRANSITION"


def test_milestone_paid_requires_full_amount(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track)
    token = _token(client, admin.email)
    m = _create_milestone(client, token, project.id, amount=10_000)
    mid = m["id"]
    r = client.post(
        f"{API}/finance/payment-milestones/{mid}/status",
        headers=_auth(token),
        json={"status": "paid", "received_amount": 3000},
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "MILESTONE_AMOUNT_MISMATCH"


def test_milestone_cancel_requires_reason(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track)
    token = _token(client, admin.email)
    m = _create_milestone(client, token, project.id)
    mid = m["id"]
    assert (
        client.post(
            f"{API}/finance/payment-milestones/{mid}/status",
            headers=_auth(token),
            json={"status": "cancelled"},
        ).status_code
        == 400
    )
    r = client.post(
        f"{API}/finance/payment-milestones/{mid}/status",
        headers=_auth(token),
        json={"status": "cancelled", "reason": "client walked away"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"


# --------------------------------------------------------------------------- #
# Project costs (BR-069)
# --------------------------------------------------------------------------- #
def test_project_cost_crud(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track)
    token = _token(client, admin.email)

    r = client.post(
        f"{API}/finance/project-costs",
        headers=_auth(token),
        json={"project_id": str(project.id), "description": "Cloud", "amount": 7500},
    )
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    track["audit"].append(uuid.UUID(cid))

    r = client.patch(
        f"{API}/finance/project-costs/{cid}",
        headers=_auth(token),
        json={"amount": 9000},
    )
    assert r.status_code == 200 and r.json()["amount"] == 9000

    r = client.get(
        f"{API}/finance/project-costs?project_id={project.id}",
        headers=_auth(token),
    )
    assert r.status_code == 200 and r.json()["total"] == 1

    assert (
        client.delete(
            f"{API}/finance/project-costs/{cid}", headers=_auth(token)
        ).status_code
        == 204
    )


def test_project_cost_gate_blocks_membro(client, make_user, track) -> None:
    membro = make_user(role="membro")
    project = _make_project(track)
    r = client.post(
        f"{API}/finance/project-costs",
        headers=_auth(_token(client, membro.email)),
        json={"project_id": str(project.id), "description": "x", "amount": 1},
    )
    assert r.status_code == 403


# --------------------------------------------------------------------------- #
# Live margin (BR-065)
# --------------------------------------------------------------------------- #
def test_financial_summary_margin_computation(client, make_user, track) -> None:
    admin = make_user(role="admin")
    # contracted 100000, rate 6000 cents/hour
    project = _make_project(
        track, contracted_value=100_000, internal_cost_rate=6000
    )
    token = _token(client, admin.email)

    # 2 logged hours → labour cost 12000
    _seed_hours(project.id, admin.id, hours=2.0)
    # one cost line of 5000
    client.post(
        f"{API}/finance/project-costs",
        headers=_auth(token),
        json={"project_id": str(project.id), "description": "SaaS", "amount": 5000},
    )
    # a milestone: amount 40000, receive full → received 40000
    m = _create_milestone(client, token, project.id, amount=40_000)
    client.post(
        f"{API}/finance/payment-milestones/{m['id']}/status",
        headers=_auth(token),
        json={"status": "paid"},
    )

    r = client.get(
        f"{API}/finance/projects/{project.id}/summary", headers=_auth(token)
    )
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["contracted"] == 100_000
    assert s["logged_hours"] == 2.0
    assert s["labor_cost"] == 12_000
    assert s["costs_total"] == 5000
    # margin = 100000 - 12000 - 5000 = 83000
    assert s["margin"] == 83_000
    assert s["received"] == 40_000
    assert s["pending"] == 0  # active milestone fully paid
    assert s["milestone_count"] == 1


def test_financial_summary_gated(client, make_user, track) -> None:
    membro = make_user(role="membro")
    project = _make_project(track)
    r = client.get(
        f"{API}/finance/projects/{project.id}/summary",
        headers=_auth(_token(client, membro.email)),
    )
    assert r.status_code == 403
