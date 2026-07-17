"""Tests for workload / capacity computation (F13, BR-080..084).

Covers the derivation formula (net capacity from the role utilization target,
allocation % from open task estimates, the BR-082 availability band, and the
BR-084 over-allocation flag), the exclusion of done/archived tasks, the BR-002
team-vs-own scoping (a Membro can never see the team), and role gating on the
per-member detail endpoint. Runs against the real Postgres (:5433).

``compute_entry`` is also exercised as a pure unit (no DB) so the arithmetic is
pinned independently of the query layer.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.project import Project
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.services import workload_service

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
    ids: dict[str, list[uuid.UUID]] = {"project": []}
    yield ids
    db = SessionLocal()
    try:
        if ids["project"]:
            # tasks + time entries cascade on project delete.
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        db.commit()
    finally:
        db.close()


def _make_project(track: dict) -> Project:
    db = SessionLocal()
    try:
        project = Project(name=f"WL {uuid.uuid4().hex[:8]}", status="active")
        db.add(project)
        db.commit()
        db.refresh(project)
        track["project"].append(project.id)
        db.expunge(project)
        return project
    finally:
        db.close()


def _seed_task(
    project_id: uuid.UUID,
    assignee_id: uuid.UUID,
    estimate: float,
    *,
    status: str = "todo",
    archived: bool = False,
) -> None:
    db = SessionLocal()
    try:
        db.add(
            Task(
                project_id=project_id,
                title="T",
                status=status,
                estimate_hours=estimate,
                primary_assignee_id=assignee_id,
                archived_at=datetime.now(tz=UTC) if archived else None,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_billable(
    project_id: uuid.UUID, user_id: uuid.UUID, hours: float
) -> None:
    db = SessionLocal()
    try:
        task = Task(project_id=project_id, title="TE", status="todo")
        db.add(task)
        db.flush()
        # Start well inside the current ISO week so it lands in the window.
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
# Pure computation (no DB) — pins the BR-080..084 arithmetic
# --------------------------------------------------------------------------- #
def _fake_user(role: str, capacity: float, override: str | None = None) -> User:
    return User(
        id=uuid.uuid4(),
        name="X",
        email="x@example.com",
        password_hash="h",
        role=role,
        status="active",
        weekly_capacity_hours=capacity,
        availability_override=override,
    )


def test_compute_entry_over_allocated() -> None:
    # membro target 0.80 × 40h capacity = 32h net; 40h allocated → 125%.
    entry = workload_service.compute_entry(
        _fake_user("membro", 40), allocated_hours=40, billable_hours_week=0
    )
    assert entry.role_utilization_target == 0.80
    assert entry.net_capacity_hours == 32.0
    assert entry.allocated_hours == 40.0
    assert entry.available_hours == -8.0
    assert entry.allocation_pct == 125.0
    assert entry.availability_state == "sobrecarregado"
    assert entry.over_allocated is True


def test_compute_entry_balanced_and_available() -> None:
    balanced = workload_service.compute_entry(
        _fake_user("membro", 40), allocated_hours=24, billable_hours_week=0
    )
    # 24 / 32 = 75% → within 70..100 band.
    assert balanced.allocation_pct == 75.0
    assert balanced.availability_state == "equilibrado"
    assert balanced.over_allocated is False

    available = workload_service.compute_entry(
        _fake_user("membro", 40), allocated_hours=8, billable_hours_week=0
    )
    # 8 / 32 = 25% → below 70% band.
    assert available.allocation_pct == 25.0
    assert available.availability_state == "disponivel"


def test_compute_entry_override_forces_ausente() -> None:
    entry = workload_service.compute_entry(
        _fake_user("membro", 40, override="Férias"),
        allocated_hours=40,
        billable_hours_week=0,
    )
    # Over-allocated on paper, but manual PTO override wins the display state.
    assert entry.availability_state == "ausente"
    assert entry.over_allocated is True  # flag still reflects the load


def test_compute_entry_utilization_from_billable() -> None:
    entry = workload_service.compute_entry(
        _fake_user("membro", 40), allocated_hours=0, billable_hours_week=16
    )
    # 16 billable / 32 net capacity = 50%.
    assert entry.utilization_pct == 50.0
    assert entry.billable_hours_week == 16.0


# --------------------------------------------------------------------------- #
# End-to-end computation via the API
# --------------------------------------------------------------------------- #
def test_workload_detail_reflects_open_estimates(client, make_user, track) -> None:
    admin = make_user(role="admin")
    membro = make_user(role="membro")  # capacity default 40 → net 32
    project = _make_project(track)

    _seed_task(project.id, membro.id, 20)  # open
    _seed_task(project.id, membro.id, 20)  # open → 40 total
    _seed_task(project.id, membro.id, 100, status="done")  # excluded
    _seed_task(project.id, membro.id, 100, archived=True)  # excluded

    resp = client.get(
        f"{API}/workload/{membro.id}", headers=_auth(_token(client, admin.email))
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["allocated_hours"] == 40.0
    assert body["net_capacity_hours"] == 32.0
    assert body["allocation_pct"] == 125.0
    assert body["over_allocated"] is True
    assert body["availability_state"] == "sobrecarregado"


def test_workload_utilization_reflects_billable(client, make_user, track) -> None:
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    project = _make_project(track)
    _seed_billable(project.id, membro.id, 16)

    resp = client.get(
        f"{API}/workload/{membro.id}", headers=_auth(_token(client, admin.email))
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["utilization_pct"] == 50.0


# --------------------------------------------------------------------------- #
# BR-002 scoping — team vs own
# --------------------------------------------------------------------------- #
def test_membro_team_view_is_own_only(client, make_user, track) -> None:
    make_user(role="admin")
    membro = make_user(role="membro")
    make_user(role="gestor")  # another team member that must NOT leak

    resp = client.get(f"{API}/workload", headers=_auth(_token(client, membro.email)))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["user_id"] == str(membro.id)


def test_admin_team_view_sees_everyone(client, make_user, track) -> None:
    admin = make_user(role="admin")
    membro = make_user(role="membro")

    resp = client.get(f"{API}/workload", headers=_auth(_token(client, admin.email)))
    assert resp.status_code == 200, resp.text
    ids = {item["user_id"] for item in resp.json()["items"]}
    assert str(admin.id) in ids
    assert str(membro.id) in ids
    assert "over_allocated_count" in resp.json()


def test_membro_cannot_read_another_members_detail(client, make_user, track) -> None:
    membro = make_user(role="membro")
    other = make_user(role="membro")

    token = _token(client, membro.email)
    # Own detail: allowed.
    assert (
        client.get(f"{API}/workload/{membro.id}", headers=_auth(token)).status_code
        == 200
    )
    # Someone else's: 404 (enumeration-safe), not 403.
    assert (
        client.get(f"{API}/workload/{other.id}", headers=_auth(token)).status_code
        == 404
    )


def test_gestor_can_read_any_member_detail(client, make_user, track) -> None:
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    resp = client.get(
        f"{API}/workload/{membro.id}", headers=_auth(_token(client, gestor.email))
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["user_id"] == str(membro.id)


def test_workload_requires_auth(client) -> None:
    assert client.get(f"{API}/workload").status_code == 401
