"""Integration tests for the tasks & phases API (F10) against the real Postgres
(:5433).

Covers the happy paths (create task, linear transitions, phase completion), the
task state-machine guards (illegal transition → 409), dependency gating
(BR-045 — unmet blocker → 409) and cycle rejection (BR-047 → 409), the approval
rule (BR-049 — a Membro cannot approve ``in_review`` → ``done``), the project
freeze seam (BR-053 — a frozen project rejects forward child transitions), and
the Membro role-scoping boundary (BR-002 → 404).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog
from app.models.project import Milestone, Project, ProjectMember, ProjectPhase
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
    """Track project ids; teardown removes their audit logs then the projects
    (children cascade)."""
    project_ids: list[uuid.UUID] = []
    yield project_ids
    db = SessionLocal()
    try:
        if project_ids:
            task_ids = list(
                db.scalars(
                    select(Task.id).where(Task.project_id.in_(project_ids))
                )
            )
            phase_ids = list(
                db.scalars(
                    select(ProjectPhase.id).where(
                        ProjectPhase.project_id.in_(project_ids)
                    )
                )
            )
            milestone_ids = list(
                db.scalars(
                    select(Milestone.id).where(
                        Milestone.project_id.in_(project_ids)
                    )
                )
            )
            audit_ids = project_ids + task_ids + phase_ids + milestone_ids
            db.execute(
                delete(ActivityLog).where(ActivityLog.entity_id.in_(audit_ids))
            )
            db.execute(delete(Project).where(Project.id.in_(project_ids)))
        db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Direct-insert / API helpers
# --------------------------------------------------------------------------- #
def _create_project(client: TestClient, token: str, track: list, **overrides) -> dict:
    body = {"name": f"Proj {uuid.uuid4().hex[:8]}", **overrides}
    resp = client.post(f"{API}/projects", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track.append(uuid.UUID(data["id"]))
    return data


def _add_member(project_id: str, user_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        db.add(ProjectMember(project_id=uuid.UUID(project_id), user_id=user_id))
        db.commit()
    finally:
        db.close()


def _set_project_status(project_id: str, status: str) -> None:
    db = SessionLocal()
    try:
        project = db.get(Project, uuid.UUID(project_id))
        project.status = status
        db.commit()
    finally:
        db.close()


def _create_task(client: TestClient, token: str, project_id: str, **overrides) -> dict:
    body = {"project_id": project_id, "title": f"T {uuid.uuid4().hex[:6]}", **overrides}
    resp = client.post(f"{API}/tasks", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _transition(client: TestClient, token: str, task_id: str, target: str):
    return client.post(
        f"{API}/tasks/{task_id}/transition",
        json={"status": target},
        headers=_auth(token),
    )


def _drive_to_done(client: TestClient, token: str, task_id: str) -> None:
    """Owner/Gestor path todo → in_progress → in_review → done."""
    for target in ("in_progress", "in_review", "done"):
        resp = _transition(client, token, task_id, target)
        assert resp.status_code == 200, resp.text


# --------------------------------------------------------------------------- #
# Happy paths
# --------------------------------------------------------------------------- #
def test_create_and_linear_transition(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])
    assert task["status"] == "todo"

    r1 = _transition(client, token, task["id"], "in_progress")
    assert r1.status_code == 200, r1.text
    assert r1.json()["status"] == "in_progress"

    r2 = _transition(client, token, task["id"], "in_review")
    assert r2.json()["status"] == "in_review"

    r3 = _transition(client, token, task["id"], "done")
    assert r3.status_code == 200, r3.text
    assert r3.json()["status"] == "done"


def test_illegal_transition_conflicts(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])
    # todo → done is not a legal edge.
    resp = _transition(client, token, task["id"], "done")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "TASK_INVALID_TRANSITION"


# --------------------------------------------------------------------------- #
# Dependency gating (BR-045) + cycle rejection (BR-047)
# --------------------------------------------------------------------------- #
def test_dependency_gating_blocks_start(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    blocker = _create_task(client, token, project["id"])
    dependent = _create_task(client, token, project["id"])

    dep = client.post(
        f"{API}/tasks/{dependent['id']}/dependencies",
        json={"depends_on_task_id": blocker["id"]},
        headers=_auth(token),
    )
    assert dep.status_code == 201, dep.text

    # Blocker not done → dependent cannot start.
    blocked_start = _transition(client, token, dependent["id"], "in_progress")
    assert blocked_start.status_code == 409
    body = blocked_start.json()["error"]
    assert body["code"] == "TASK_DEPENDENCIES_UNMET"
    assert blocker["id"] in body["details"]["unmet_dependencies"]

    # Complete the blocker, then the dependent may start.
    _drive_to_done(client, token, blocker["id"])
    ok = _transition(client, token, dependent["id"], "in_progress")
    assert ok.status_code == 200, ok.text


def test_dependency_cycle_rejected(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    a = _create_task(client, token, project["id"])
    b = _create_task(client, token, project["id"])

    first = client.post(
        f"{API}/tasks/{a['id']}/dependencies",
        json={"depends_on_task_id": b["id"]},
        headers=_auth(token),
    )
    assert first.status_code == 201, first.text
    # b -> a would close the cycle a -> b -> a.
    cycle = client.post(
        f"{API}/tasks/{b['id']}/dependencies",
        json={"depends_on_task_id": a["id"]},
        headers=_auth(token),
    )
    assert cycle.status_code == 409
    assert cycle.json()["error"]["code"] == "TASK_DEPENDENCY_CYCLE"


# --------------------------------------------------------------------------- #
# Approval rule (BR-049 / C3)
# --------------------------------------------------------------------------- #
def test_membro_cannot_approve_but_gestor_can(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    gtoken = _token(client, gestor.email)
    mtoken = _token(client, membro.email)
    project = _create_project(client, gtoken, track)
    _add_member(project["id"], membro.id)
    task = _create_task(client, gtoken, project["id"], primary_assignee_id=str(membro.id))

    # Membro moves the task up to in_review (allowed).
    assert _transition(client, mtoken, task["id"], "in_progress").status_code == 200
    assert _transition(client, mtoken, task["id"], "in_review").status_code == 200

    # Membro cannot approve completion.
    denied = _transition(client, mtoken, task["id"], "done")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "TASK_APPROVAL_FORBIDDEN"

    # The owning Gestor can.
    approved = _transition(client, gtoken, task["id"], "done")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "done"


# --------------------------------------------------------------------------- #
# Freeze seam (BR-053) — frozen project rejects forward child transitions
# --------------------------------------------------------------------------- #
def test_frozen_project_blocks_forward_transition(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])
    _set_project_status(project["id"], "on_hold")

    resp = _transition(client, token, task["id"], "in_progress")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "PROJECT_FROZEN"


# --------------------------------------------------------------------------- #
# Blocking (BR-046)
# --------------------------------------------------------------------------- #
def test_block_and_unblock(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])

    blocked = client.post(
        f"{API}/tasks/{task['id']}/block",
        json={"reason": "à espera de cliente"},
        headers=_auth(token),
    )
    assert blocked.status_code == 200, blocked.text
    assert blocked.json()["status"] == "blocked"
    assert blocked.json()["block_reason"] == "à espera de cliente"

    unblocked = client.post(
        f"{API}/tasks/{task['id']}/unblock",
        json={"status": "todo"},
        headers=_auth(token),
    )
    assert unblocked.status_code == 200, unblocked.text
    assert unblocked.json()["status"] == "todo"
    assert unblocked.json()["block_reason"] is None


# --------------------------------------------------------------------------- #
# Role scoping (BR-002)
# --------------------------------------------------------------------------- #
def test_membro_cannot_see_task_outside_scope(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    gtoken = _token(client, gestor.email)
    mtoken = _token(client, membro.email)
    project = _create_project(client, gtoken, track)
    task = _create_task(client, gtoken, project["id"])

    resp = client.get(f"{API}/tasks/{task['id']}", headers=_auth(mtoken))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "TASK_NOT_FOUND"


# --------------------------------------------------------------------------- #
# Phases (BR-050/051)
# --------------------------------------------------------------------------- #
def test_phase_complete_requires_tasks_done(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)

    phase = client.post(
        f"{API}/phases",
        json={"project_id": project["id"], "name": "Descoberta"},
        headers=_auth(token),
    )
    assert phase.status_code == 201, phase.text
    phase_id = phase.json()["id"]

    task = _create_task(client, token, project["id"], phase_id=phase_id)

    started = client.post(
        f"{API}/phases/{phase_id}/transition",
        json={"status": "in_progress"},
        headers=_auth(token),
    )
    assert started.status_code == 200, started.text

    # Task not done → phase completion blocked.
    early = client.post(f"{API}/phases/{phase_id}/complete", headers=_auth(token))
    assert early.status_code == 409
    assert early.json()["error"]["code"] == "PHASE_TASKS_INCOMPLETE"

    _drive_to_done(client, token, task["id"])
    done = client.post(f"{API}/phases/{phase_id}/complete", headers=_auth(token))
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed"
    assert done.json()["progress"] == 100


def test_phase_with_zero_tasks_cannot_complete(client, make_user, track):
    """Audit H19: total==done is vacuously true at 0==0 — a phase with no
    tracked work must not be completable ("no waiver", C2)."""
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)

    phase = client.post(
        f"{API}/phases",
        json={"project_id": project["id"], "name": "Vazia"},
        headers=_auth(token),
    )
    assert phase.status_code == 201, phase.text
    phase_id = phase.json()["id"]

    client.post(
        f"{API}/phases/{phase_id}/transition",
        json={"status": "in_progress"},
        headers=_auth(token),
    )
    blocked = client.post(f"{API}/phases/{phase_id}/complete", headers=_auth(token))
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["error"]["code"] == "PHASE_TASKS_INCOMPLETE"


# --------------------------------------------------------------------------- #
# Archive / restore / duplicate (audit C13)
# --------------------------------------------------------------------------- #
def test_archive_restore_duplicate_task(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"], estimate_hours=3)

    archived = client.post(f"{API}/tasks/{task['id']}/archive", headers=_auth(token))
    assert archived.status_code == 200, archived.text
    assert archived.json()["archived_at"] is not None

    # Archiving is idempotent.
    again = client.post(f"{API}/tasks/{task['id']}/archive", headers=_auth(token))
    assert again.status_code == 200, again.text

    restored = client.post(f"{API}/tasks/{task['id']}/restore", headers=_auth(token))
    assert restored.status_code == 200, restored.text
    assert restored.json()["archived_at"] is None

    dup = client.post(f"{API}/tasks/{task['id']}/duplicate", headers=_auth(token))
    assert dup.status_code == 201, dup.text
    assert dup.json()["id"] != task["id"]
    assert dup.json()["status"] == "todo"
    assert dup.json()["title"] == f"{task['title']} (cópia)"


def test_archive_task_stops_running_timer(client, make_user, track):
    """BR-042/audit C13: archiving a task must stop any timer running on it."""
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])
    _add_member(project["id"], gestor.id)

    started = client.post(
        f"{API}/time/start",
        json={"task_id": task["id"]},
        headers=_auth(token),
    )
    assert started.status_code == 201, started.text
    entry_id = started.json()["id"]

    client.post(f"{API}/tasks/{task['id']}/archive", headers=_auth(token))

    db = SessionLocal()
    try:
        entry = db.get(TimeEntry, uuid.UUID(entry_id))
        assert entry.ended_at is not None
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Checklist (audit C12)
# --------------------------------------------------------------------------- #
def test_checklist_crud(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])

    created = client.post(
        f"{API}/tasks/{task['id']}/checklist",
        json={"text": "Rever wireframes", "order_index": 0},
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]
    assert created.json()["done"] is False

    listed = client.get(f"{API}/tasks/{task['id']}/checklist", headers=_auth(token))
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1

    updated = client.patch(
        f"{API}/tasks/{task['id']}/checklist/{item_id}",
        json={"done": True},
        headers=_auth(token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["done"] is True

    deleted = client.delete(
        f"{API}/tasks/{task['id']}/checklist/{item_id}", headers=_auth(token)
    )
    assert deleted.status_code == 204, deleted.text

    empty = client.get(f"{API}/tasks/{task['id']}/checklist", headers=_auth(token))
    assert empty.json() == []


def test_checklist_forbidden_for_unrelated_membro(client, make_user, track):
    gestor = make_user(role="gestor")
    outsider = make_user(role="membro")
    token = _token(client, gestor.email)
    project = _create_project(client, token, track)
    task = _create_task(client, token, project["id"])

    resp = client.post(
        f"{API}/tasks/{task['id']}/checklist",
        json={"text": "x"},
        headers=_auth(_token(client, outsider.email)),
    )
    # Unrelated Membro can't even see the task → 404 (BR-002, enumeration-safe).
    assert resp.status_code == 404, resp.text
