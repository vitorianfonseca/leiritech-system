"""Integration tests for the time-tracking API (F11) against the real Postgres
(:5433).

Covers the timer happy path (start → active → stop with a derived duration), the
single-active-timer rule (BR-040 — a second start → 409), manual-entry validation
(BR-044 — ended_at <= started_at, future, and > 24h all → 422), and the ownership
scoping boundary (BR-002 — a Membro cannot edit/delete another user's entry, and
cannot list a peer's entries; a Gestor can).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

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
def track() -> Iterator[list[uuid.UUID]]:
    """Track project ids; teardown removes audit rows (project + task + time
    entries) then the projects (tasks and time_entries cascade)."""
    project_ids: list[uuid.UUID] = []
    yield project_ids
    db = SessionLocal()
    try:
        if project_ids:
            task_ids = list(
                db.scalars(select(Task.id).where(Task.project_id.in_(project_ids)))
            )
            entry_ids = (
                list(
                    db.scalars(
                        select(TimeEntry.id).where(TimeEntry.task_id.in_(task_ids))
                    )
                )
                if task_ids
                else []
            )
            audit_ids = project_ids + task_ids + entry_ids
            db.execute(delete(ActivityLog).where(ActivityLog.entity_id.in_(audit_ids)))
            db.execute(delete(Project).where(Project.id.in_(project_ids)))
        db.commit()
    finally:
        db.close()


def _create_project(client: TestClient, token: str, track: list, **overrides) -> dict:
    body = {"name": f"Proj {uuid.uuid4().hex[:8]}", **overrides}
    resp = client.post(f"{API}/projects", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track.append(uuid.UUID(data["id"]))
    return data


def _create_task(client: TestClient, token: str, project_id: str, **overrides) -> dict:
    body = {"project_id": project_id, "title": f"T {uuid.uuid4().hex[:6]}", **overrides}
    resp = client.post(f"{API}/tasks", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


# --------------------------------------------------------------------------- #
# Timer happy path
# --------------------------------------------------------------------------- #
def test_timer_start_active_stop(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])

    start = client.post(
        f"{API}/time/start", json={"task_id": task["id"]}, headers=_auth(token)
    )
    assert start.status_code == 201, start.text
    body = start.json()
    assert body["ended_at"] is None
    assert body["is_running"] is True
    assert body["duration_minutes"] is None
    assert body["billable"] is True  # BR-043 default-on

    active = client.get(f"{API}/time/active", headers=_auth(token))
    assert active.status_code == 200
    assert active.json()["id"] == body["id"]

    stop = client.post(f"{API}/time/stop", headers=_auth(token))
    assert stop.status_code == 200, stop.text
    stopped = stop.json()
    assert stopped["ended_at"] is not None
    assert stopped["is_running"] is False
    assert stopped["duration_minutes"] is not None

    # No active timer once stopped.
    assert client.get(f"{API}/time/active", headers=_auth(token)).json() is None


# --------------------------------------------------------------------------- #
# Single active timer (BR-040)
# --------------------------------------------------------------------------- #
def test_second_timer_rejected(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    t1 = _create_task(client, token, project["id"])
    t2 = _create_task(client, token, project["id"])

    first = client.post(
        f"{API}/time/start", json={"task_id": t1["id"]}, headers=_auth(token)
    )
    assert first.status_code == 201, first.text

    second = client.post(
        f"{API}/time/start", json={"task_id": t2["id"]}, headers=_auth(token)
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "TIMER_ALREADY_ACTIVE"

    # Cleanup: stop the running one so teardown is not dependent on cascade order.
    client.post(f"{API}/time/stop", headers=_auth(token))


def test_stop_without_active_conflicts(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    resp = client.post(f"{API}/time/stop", headers=_auth(token))
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "NO_ACTIVE_TIMER"


# --------------------------------------------------------------------------- #
# Manual entry + BR-044 validation
# --------------------------------------------------------------------------- #
def test_manual_entry_happy_path(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])

    start = datetime.now(tz=UTC) - timedelta(hours=2)
    end = start + timedelta(minutes=90)
    resp = client.post(
        f"{API}/time",
        json={
            "task_id": task["id"],
            "started_at": start.isoformat(),
            "ended_at": end.isoformat(),
            "billable": False,
        },
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["duration_minutes"] == 90
    assert body["billable"] is False
    assert body["is_running"] is False


@pytest.mark.parametrize(
    ("start_delta", "end_delta"),
    [
        (timedelta(hours=-1), timedelta(hours=-2)),  # ended_at <= started_at
        (timedelta(hours=1), timedelta(hours=2)),  # in the future
        (timedelta(hours=-30), timedelta(hours=-1)),  # spans > 24h
    ],
)
def test_manual_entry_validation_rejected(
    client, make_user, track, start_delta, end_delta
):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])

    now = datetime.now(tz=UTC)
    resp = client.post(
        f"{API}/time",
        json={
            "task_id": task["id"],
            "started_at": (now + start_delta).isoformat(),
            "ended_at": (now + end_delta).isoformat(),
        },
        headers=_auth(token),
    )
    assert resp.status_code == 422, resp.text


# --------------------------------------------------------------------------- #
# Ownership scoping (BR-002)
# --------------------------------------------------------------------------- #
def test_membro_cannot_edit_another_users_entry(client, make_user, track):
    owner = make_user(role="gestor")
    other = make_user(role="membro")
    otoken = _token(client, owner.email)
    xtoken = _token(client, other.email)
    project = _create_project(client, otoken, track)
    task = _create_task(client, otoken, project["id"])

    start = datetime.now(tz=UTC) - timedelta(hours=1)
    created = client.post(
        f"{API}/time",
        json={
            "task_id": task["id"],
            "started_at": start.isoformat(),
            "ended_at": (start + timedelta(minutes=30)).isoformat(),
        },
        headers=_auth(otoken),
    )
    assert created.status_code == 201, created.text
    entry_id = created.json()["id"]

    # A different user cannot see/edit/delete it → 404 (enumeration-safe).
    patch = client.patch(
        f"{API}/time/{entry_id}",
        json={"description": "hijack"},
        headers=_auth(xtoken),
    )
    assert patch.status_code == 404
    assert patch.json()["error"]["code"] == "TIME_ENTRY_NOT_FOUND"

    delete_resp = client.delete(f"{API}/time/{entry_id}", headers=_auth(xtoken))
    assert delete_resp.status_code == 404

    # The owner can edit and delete their own entry.
    own_patch = client.patch(
        f"{API}/time/{entry_id}",
        json={"description": "mine"},
        headers=_auth(otoken),
    )
    assert own_patch.status_code == 200, own_patch.text
    assert own_patch.json()["description"] == "mine"
    assert client.delete(f"{API}/time/{entry_id}", headers=_auth(otoken)).status_code == 204


def test_membro_cannot_list_peer_time_but_gestor_can(client, make_user, track):
    membro = make_user(role="membro")
    gestor = make_user(role="gestor")
    peer = make_user(role="membro")
    mtoken = _token(client, membro.email)
    gtoken = _token(client, gestor.email)

    # Membro querying another user's entries → 403.
    forbidden = client.get(
        f"{API}/time", params={"user_id": str(peer.id)}, headers=_auth(mtoken)
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "TIME_ENTRY_SCOPE_FORBIDDEN"

    # Gestor querying a team member's entries → 200 (empty list is fine).
    allowed = client.get(
        f"{API}/time", params={"user_id": str(peer.id)}, headers=_auth(gtoken)
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["total"] == 0
