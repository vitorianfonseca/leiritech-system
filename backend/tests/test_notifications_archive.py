"""Tests for notification archive / unarchive (Postgres :5433).

Own-scoped, mirroring the ``/read`` ownership guard: a user archives/unarchives
only their own notifications (someone else's → 404, enumeration-safe), and the
``include_archived`` filter on the list controls visibility.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.database.session import SessionLocal
from app.models.collaboration import Notification

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed(user_id: uuid.UUID) -> uuid.UUID:
    db = SessionLocal()
    try:
        n = Notification(user_id=user_id, type="task_overdue", body="x")
        db.add(n)
        db.commit()
        db.refresh(n)
        return n.id
    finally:
        db.close()


def test_archive_then_unarchive_roundtrip(client, make_user) -> None:
    user = make_user(role="membro")
    headers = _auth(_token(client, user.email))
    nid = _seed(user.id)

    archived = client.post(f"{API}/notifications/{nid}/archive", headers=headers)
    assert archived.status_code == 200, archived.text
    assert archived.json()["archived_at"] is not None

    # Default list excludes archived; include_archived surfaces it.
    default_list = client.get(f"{API}/notifications", headers=headers)
    assert all(i["id"] != str(nid) for i in default_list.json()["items"])
    with_archived = client.get(
        f"{API}/notifications",
        headers=headers,
        params={"include_archived": True},
    )
    assert any(i["id"] == str(nid) for i in with_archived.json()["items"])

    restored = client.post(f"{API}/notifications/{nid}/unarchive", headers=headers)
    assert restored.status_code == 200, restored.text
    assert restored.json()["archived_at"] is None

    back = client.get(f"{API}/notifications", headers=headers)
    assert any(i["id"] == str(nid) for i in back.json()["items"])


def test_archive_is_idempotent(client, make_user) -> None:
    user = make_user(role="membro")
    headers = _auth(_token(client, user.email))
    nid = _seed(user.id)

    first = client.post(f"{API}/notifications/{nid}/archive", headers=headers)
    second = client.post(f"{API}/notifications/{nid}/archive", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["archived_at"] is not None


def test_cannot_archive_another_users_notification(client, make_user) -> None:
    owner = make_user(role="membro")
    intruder = make_user(role="membro")
    nid = _seed(owner.id)

    resp = client.post(
        f"{API}/notifications/{nid}/archive",
        headers=_auth(_token(client, intruder.email)),
    )
    assert resp.status_code == 404, resp.text


def test_unarchive_unknown_notification_is_404(client, make_user) -> None:
    user = make_user(role="membro")
    resp = client.post(
        f"{API}/notifications/{uuid.uuid4()}/unarchive",
        headers=_auth(_token(client, user.email)),
    )
    assert resp.status_code == 404, resp.text
