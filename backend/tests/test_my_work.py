"""Tests for the My Work daily hub (F3/F17, BR-002 own-scope, BR C3 review gate).

Covers the ``MyWork`` contract shape, that the caller's own assigned tasks
surface in the right buckets while another user's tasks never appear, that the
caller's running timer is returned, and that the review queue is empty for a
Membro. Runs against the real Postgres (:5433).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.project import Project
from app.models.task import Task
from app.models.time_entry import TimeEntry

API = "/api/v1"
PASSWORD = "correct-horse-battery"

_MYWORK_KEYS = {
    "today",
    "overdue",
    "thisWeek",
    "noDate",
    "meetings",
    "mentions",
    "reviewRequests",
    "projects",
    "recentTimeEntries",
    "activeTimer",
}


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _my_work(client: TestClient, email: str) -> dict:
    resp = client.get(f"{API}/my-work", headers=_auth(_token(client, email)))
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture
def track() -> Iterator[dict[str, list[uuid.UUID]]]:
    ids: dict[str, list[uuid.UUID]] = {"project": []}
    yield ids
    db = SessionLocal()
    try:
        if ids["project"]:
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        db.commit()
    finally:
        db.close()


def _make_project(track: dict, *, manager_id: uuid.UUID | None = None) -> Project:
    db = SessionLocal()
    try:
        project = Project(
            name=f"MW {uuid.uuid4().hex[:6]}", status="active", manager_id=manager_id
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
    project_id: uuid.UUID,
    assignee_id: uuid.UUID,
    *,
    due: date | None,
    status: str = "todo",
) -> uuid.UUID:
    db = SessionLocal()
    try:
        task = Task(
            project_id=project_id,
            title=f"MW task {uuid.uuid4().hex[:6]}",
            status=status,
            primary_assignee_id=assignee_id,
            due_date=due,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task.id
    finally:
        db.close()


def _make_active_timer(user_id: uuid.UUID, task_id: uuid.UUID) -> uuid.UUID:
    db = SessionLocal()
    try:
        entry = TimeEntry(
            user_id=user_id,
            task_id=task_id,
            started_at=datetime.now(tz=UTC) - timedelta(minutes=30),
            ended_at=None,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry.id
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Contract shape
# --------------------------------------------------------------------------- #
def test_my_work_requires_auth(client) -> None:
    assert client.get(f"{API}/my-work").status_code == 401


def test_my_work_shape(client, make_user) -> None:
    membro = make_user(role="membro")
    data = _my_work(client, membro.email)
    assert set(data.keys()) == _MYWORK_KEYS
    for key in ("today", "overdue", "thisWeek", "noDate"):
        assert isinstance(data[key], list)


# --------------------------------------------------------------------------- #
# Own-scope tasks (BR-002)
# --------------------------------------------------------------------------- #
def test_own_tasks_bucketed_and_others_excluded(client, make_user, track) -> None:
    membro = make_user(role="membro")
    other = make_user(role="membro")
    project = _make_project(track, manager_id=membro.id)

    overdue = _make_task(project.id, membro.id, due=date.today() - timedelta(days=2))
    today_task = _make_task(project.id, membro.id, due=date.today())
    other_project = _make_project(track, manager_id=other.id)
    theirs = _make_task(other_project.id, other.id, due=date.today())

    data = _my_work(client, membro.email)
    overdue_ids = {t["id"] for t in data["overdue"]}
    today_ids = {t["id"] for t in data["today"]}
    assert str(overdue) in overdue_ids
    assert str(today_task) in today_ids

    all_ids = {
        t["id"]
        for bucket in ("today", "overdue", "thisWeek", "noDate")
        for t in data[bucket]
    }
    assert str(theirs) not in all_ids


def test_active_timer_returned_for_caller(client, make_user, track) -> None:
    membro = make_user(role="membro")
    project = _make_project(track, manager_id=membro.id)
    task_id = _make_task(project.id, membro.id, due=date.today())
    entry_id = _make_active_timer(membro.id, task_id)

    data = _my_work(client, membro.email)
    assert data["activeTimer"] is not None
    assert data["activeTimer"]["id"] == str(entry_id)
    assert data["activeTimer"]["taskId"] == str(task_id)

    # A different user never sees this caller's timer.
    other = make_user(role="membro")
    assert _my_work(client, other.email)["activeTimer"] is None


# --------------------------------------------------------------------------- #
# Review gate (BR C3)
# --------------------------------------------------------------------------- #
def test_membro_review_queue_empty(client, make_user, track) -> None:
    membro = make_user(role="membro")
    project = _make_project(track, manager_id=membro.id)
    _make_task(project.id, membro.id, due=date.today(), status="in_review")

    data = _my_work(client, membro.email)
    assert data["reviewRequests"] == []


def test_admin_sees_review_request(client, make_user, track) -> None:
    admin = make_user(role="admin")
    member = make_user(role="membro")
    project = _make_project(track, manager_id=admin.id)
    task_id = _make_task(
        project.id, member.id, due=date.today(), status="in_review"
    )

    data = _my_work(client, admin.email)
    review_ids = {r["taskId"] for r in data["reviewRequests"]}
    assert str(task_id) in review_ids
