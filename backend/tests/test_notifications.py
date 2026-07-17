"""Tests for the notification center + producer helper (F15).

Covers the owner-scoped reads (list / unread-count), the read-state mutations
(mark one / mark all) and the BR-002 scoping boundary (a user can neither read
nor mark another user's notifications — 404, enumeration-safe). Also pins the
``create_notification`` idempotency contract (``group_key`` de-dup) that the
daily automations rely on, and two representative event notifications.

Runs against the real Postgres (:5433). Notifications hang off ``user_id`` with
``ON DELETE CASCADE``, so tearing down the ``make_user`` accounts cleans them up.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.database.session import SessionLocal
from app.models.collaboration import Notification
from app.models.user import User
from app.services import notification_service

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_notification(
    user_id: uuid.UUID, *, type: str = "task_overdue", group_key: str | None = None
) -> uuid.UUID:
    db = SessionLocal()
    try:
        n = Notification(user_id=user_id, type=type, body="x", group_key=group_key)
        db.add(n)
        db.commit()
        db.refresh(n)
        return n.id
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# create_notification — producer contract (idempotency backbone)
# --------------------------------------------------------------------------- #
def test_create_notification_dedupes_on_group_key(make_user) -> None:
    user = make_user(role="membro")
    db = SessionLocal()
    try:
        first = notification_service.create_notification(
            db, user_id=user.id, type="task_overdue", body="a", group_key="k:1"
        )
        second = notification_service.create_notification(
            db, user_id=user.id, type="task_overdue", body="a", group_key="k:1"
        )
        db.commit()
        assert first is not None
        assert second is None  # same group_key → skipped
    finally:
        db.close()


def test_notify_many_skips_duplicate_recipients(make_user) -> None:
    user = make_user(role="gestor")
    db = SessionLocal()
    try:
        created = notification_service.notify_many(
            db,
            user_ids=[user.id, user.id, None],
            type="workload_over_allocated",
            body="x",
            group_key="wl:1",
        )
        db.commit()
        assert created == 1  # collapsed duplicate + skipped None
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Reads + read-state mutations
# --------------------------------------------------------------------------- #
def test_list_and_unread_count(client, make_user) -> None:
    user = make_user(role="membro")
    _seed_notification(user.id)
    _seed_notification(user.id)
    token = _token(client, user.email)

    listing = client.get(f"{API}/notifications", headers=_auth(token))
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] == 2

    count = client.get(f"{API}/notifications/unread-count", headers=_auth(token))
    assert count.status_code == 200
    assert count.json()["unread"] == 2


def test_mark_read_decrements_unread(client, make_user) -> None:
    user = make_user(role="membro")
    nid = _seed_notification(user.id)
    token = _token(client, user.email)

    resp = client.post(f"{API}/notifications/{nid}/read", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["read_at"] is not None

    count = client.get(f"{API}/notifications/unread-count", headers=_auth(token))
    assert count.json()["unread"] == 0


def test_mark_all_read(client, make_user) -> None:
    user = make_user(role="membro")
    _seed_notification(user.id)
    _seed_notification(user.id)
    token = _token(client, user.email)

    resp = client.post(f"{API}/notifications/read-all", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["marked"] == 2
    # Idempotent: nothing left to mark.
    again = client.post(f"{API}/notifications/read-all", headers=_auth(token))
    assert again.json()["marked"] == 0


# --------------------------------------------------------------------------- #
# BR-002 scoping — a user only ever touches their own notifications
# --------------------------------------------------------------------------- #
def test_list_excludes_other_users_notifications(client, make_user) -> None:
    owner = make_user(role="membro")
    other = make_user(role="membro")
    _seed_notification(owner.id)

    token = _token(client, other.email)
    listing = client.get(f"{API}/notifications", headers=_auth(token))
    assert listing.status_code == 200
    assert listing.json()["total"] == 0


def test_cannot_mark_another_users_notification(client, make_user) -> None:
    owner = make_user(role="membro")
    other = make_user(role="membro")
    nid = _seed_notification(owner.id)

    token = _token(client, other.email)
    resp = client.post(f"{API}/notifications/{nid}/read", headers=_auth(token))
    assert resp.status_code == 404  # enumeration-safe, not 403

    # And the owner's notification is untouched.
    db = SessionLocal()
    try:
        assert db.get(Notification, nid).read_at is None
    finally:
        db.close()


def test_notifications_require_auth(client) -> None:
    assert client.get(f"{API}/notifications").status_code == 401
    assert client.get(f"{API}/notifications/unread-count").status_code == 401


# --------------------------------------------------------------------------- #
# Event notifications (representative)
# --------------------------------------------------------------------------- #
def test_task_assignment_notifies_assignee(client, make_user) -> None:
    from app.models.project import Project, ProjectMember
    from app.models.task import Task
    from app.schemas.tasks import TaskAssign
    from app.services import task_service

    admin = make_user(role="admin")
    assignee = make_user(role="membro")

    db = SessionLocal()
    project_id = None
    try:
        project = Project(name=f"N {uuid.uuid4().hex[:8]}", status="active")
        db.add(project)
        db.flush()
        project_id = project.id
        db.add(ProjectMember(project_id=project.id, user_id=assignee.id))
        task = Task(project_id=project.id, title="T", status="todo")
        db.add(task)
        db.flush()

        actor = db.get(User, admin.id)
        task_service.assign_task(
            db, actor, task.id, TaskAssign(primary_assignee_id=assignee.id)
        )
        db.commit()

        note = db.execute(
            Notification.__table__.select().where(
                Notification.user_id == assignee.id,
                Notification.type == "task_assigned",
            )
        ).first()
        assert note is not None
    finally:
        if project_id is not None:
            from sqlalchemy import delete

            from app.models.project import Project as P

            db.execute(delete(P).where(P.id == project_id))
            db.commit()
        db.close()
