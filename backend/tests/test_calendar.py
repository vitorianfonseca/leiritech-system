"""Tests for the aggregate calendar feed (F12, BR-002/BR-008).

Covers the ``list[CalendarEvent]`` contract shape, that seeded dated items in the
range surface, the Membro own-scope boundary (a Membro never sees another user's
task events), and the BR-008 finance gate (payment-milestone events are withheld
from a caller who cannot manage financials). Runs against the real Postgres
(:5433).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.finance import PaymentMilestone
from app.models.project import Project
from app.models.task import Task

API = "/api/v1"
PASSWORD = "correct-horse-battery"

_EVENT_KEYS = {
    "id",
    "type",
    "title",
    "start",
    "end",
    "allDay",
    "projectId",
    "projectName",
    "sourceHref",
    "urgency",
    "location",
    "description",
    "amountCents",
}


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _calendar(client: TestClient, email: str, *, days: int = 30) -> list[dict]:
    start = (date.today() - timedelta(days=7)).isoformat()
    end = (date.today() + timedelta(days=days)).isoformat()
    resp = client.get(
        f"{API}/calendar",
        params={"from": start, "to": end},
        headers=_auth(_token(client, email)),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture
def track() -> Iterator[dict[str, list[uuid.UUID]]]:
    ids: dict[str, list[uuid.UUID]] = {"project": []}
    yield ids
    db = SessionLocal()
    try:
        if ids["project"]:
            # Cascades to tasks / phases / milestones / time entries.
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        db.commit()
    finally:
        db.close()


def _make_project(track: dict, *, manager_id: uuid.UUID | None = None) -> Project:
    db = SessionLocal()
    try:
        project = Project(
            name=f"Cal {uuid.uuid4().hex[:6]}", status="active", manager_id=manager_id
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        track["project"].append(project.id)
        db.expunge(project)
        return project
    finally:
        db.close()


def _make_task(
    project_id: uuid.UUID, assignee_id: uuid.UUID, *, due: date
) -> uuid.UUID:
    db = SessionLocal()
    try:
        task = Task(
            project_id=project_id,
            title=f"Cal task {uuid.uuid4().hex[:6]}",
            status="todo",
            primary_assignee_id=assignee_id,
            due_date=due,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        tid = task.id
        return tid
    finally:
        db.close()


def _make_milestone(project_id: uuid.UUID, *, expected: date, amount: int) -> uuid.UUID:
    db = SessionLocal()
    try:
        pm = PaymentMilestone(
            project_id=project_id,
            description="Marco de pagamento",
            amount=amount,
            expected_date=expected,
            status="planned",
        )
        db.add(pm)
        db.commit()
        db.refresh(pm)
        mid = pm.id
        return mid
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Contract shape
# --------------------------------------------------------------------------- #
def test_calendar_requires_auth(client) -> None:
    assert client.get(f"{API}/calendar").status_code == 401


def test_calendar_shape_and_task_event(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track, manager_id=admin.id)
    task_id = _make_task(project.id, admin.id, due=date.today() + timedelta(days=1))

    events = _calendar(client, admin.email)
    task_events = [e for e in events if e["id"] == f"task-{task_id}"]
    assert task_events, "seeded task due tomorrow should surface in range"
    event = task_events[0]
    assert set(event.keys()) == _EVENT_KEYS
    assert event["type"] == "task"
    assert event["allDay"] is True
    assert event["urgency"] == "due"
    assert event["projectId"] == str(project.id)
    assert event["sourceHref"] == f"/tasks?task={task_id}"


def test_calendar_invalid_range_is_400(client, make_user) -> None:
    admin = make_user(role="admin")
    resp = client.get(
        f"{API}/calendar",
        params={"from": "2026-07-10", "to": "2026-07-10"},
        headers=_auth(_token(client, admin.email)),
    )
    assert resp.status_code == 400, resp.text


def test_calendar_out_of_range_excluded(client, make_user, track) -> None:
    admin = make_user(role="admin")
    project = _make_project(track, manager_id=admin.id)
    far_task = _make_task(project.id, admin.id, due=date.today() + timedelta(days=120))

    events = _calendar(client, admin.email, days=30)
    assert not [e for e in events if e["id"] == f"task-{far_task}"]


# --------------------------------------------------------------------------- #
# Role scoping (BR-002)
# --------------------------------------------------------------------------- #
def test_membro_sees_only_own_task_events(client, make_user, track) -> None:
    membro = make_user(role="membro")
    other = make_user(role="membro")

    mine_project = _make_project(track, manager_id=membro.id)
    mine = _make_task(mine_project.id, membro.id, due=date.today() + timedelta(days=2))

    other_project = _make_project(track, manager_id=other.id)
    theirs = _make_task(
        other_project.id, other.id, due=date.today() + timedelta(days=2)
    )

    ids = {e["id"] for e in _calendar(client, membro.email)}
    assert f"task-{mine}" in ids
    assert f"task-{theirs}" not in ids

    # Admin (full scope) sees both.
    admin = make_user(role="admin")
    admin_ids = {e["id"] for e in _calendar(client, admin.email)}
    assert {f"task-{mine}", f"task-{theirs}"} <= admin_ids


# --------------------------------------------------------------------------- #
# Finance gate (BR-008)
# --------------------------------------------------------------------------- #
def test_payment_events_gated_by_finance(client, make_user, track) -> None:
    project = _make_project(track)
    milestone = _make_milestone(
        project.id, expected=date.today() + timedelta(days=3), amount=480000
    )
    payment_id = f"payment-{milestone}"

    # Admin (finance) sees the payment event with its amount.
    admin = make_user(role="admin")
    admin_events = _calendar(client, admin.email)
    payment = next((e for e in admin_events if e["id"] == payment_id), None)
    assert payment is not None
    assert payment["type"] == "payment"
    assert payment["amountCents"] == 480000

    # Gestor without the payments grant never sees payment events.
    gestor = make_user(role="gestor", payments_grant=False)
    assert payment_id not in {e["id"] for e in _calendar(client, gestor.email)}
