"""Tests for the collaboration comments API (F16) against Postgres (:5433).

Covers: list/create/edit/delete happy paths, parent-visibility scoping (a Membro
cannot read or post on a company they are not scoped to → 404), @mention →
Notification fan-out (only to users who can see the parent), and author-only
edit/delete (Admin may also delete).

The camelCase request/response shapes are exercised directly so the frontend
collaboration client (`collaboration-types.ts`) can swap its mock for real
fetch without changing any exported type.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.database.session import SessionLocal
from app.models.collaboration import Comment, Notification
from app.models.crm import Company

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
    """Track company (entity) ids; tear down their comments then the companies."""
    ids: list[uuid.UUID] = []
    yield ids
    db = SessionLocal()
    try:
        if ids:
            # Comments are polymorphic (no FK to companies) — delete them first;
            # their mentions cascade with the comment row.
            db.execute(delete(Comment).where(Comment.entity_id.in_(ids)))
            db.execute(delete(Company).where(Company.id.in_(ids)))
            db.commit()
    finally:
        db.close()


def _make_company(owner_id: uuid.UUID, track: list[uuid.UUID]) -> uuid.UUID:
    db = SessionLocal()
    try:
        company = Company(
            name=f"ACME {uuid.uuid4().hex[:8]}",
            status="active",
            owner_id=owner_id,
            created_by=owner_id,
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        track.append(company.id)
        return company.id
    finally:
        db.close()


def _post_comment(client, token, company_id, body, mentions=None):
    return client.post(
        f"{API}/comments",
        json={
            "entityType": "company",
            "entityId": str(company_id),
            "body": body,
            "mentions": [str(m) for m in (mentions or [])],
        },
        headers=_auth(token),
    )


def test_create_and_list_comment_happy_path(client, make_user, track):
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)
    token = _token(client, gestor.email)

    created = _post_comment(client, token, company_id, "Primeira nota.")
    assert created.status_code == 201, created.text
    body = created.json()
    # camelCase contract shape.
    assert body["entityType"] == "company"
    assert body["entityId"] == str(company_id)
    assert body["body"] == "Primeira nota."
    assert body["author"]["id"] == str(gestor.id)
    assert body["author"]["email"] == gestor.email
    assert body["mentions"] == []
    assert body["attachments"] == []
    # Fresh comment is not edited: createdAt == updatedAt.
    assert body["createdAt"] == body["updatedAt"]

    listed = client.get(
        f"{API}/comments",
        params={"entity_type": "company", "entity_id": str(company_id)},
        headers=_auth(token),
    )
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["id"] == body["id"]


def test_membro_cannot_read_or_post_on_unscoped_entity(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    company_id = _make_company(gestor.id, track)
    membro_token = _token(client, membro.email)

    # Read is 404 (enumeration-safe) — parent is out of scope.
    listed = client.get(
        f"{API}/comments",
        params={"entity_type": "company", "entity_id": str(company_id)},
        headers=_auth(membro_token),
    )
    assert listed.status_code == 404, listed.text

    # Post is 404 as well — blocked before any write.
    posted = _post_comment(client, membro_token, company_id, "não devia entrar")
    assert posted.status_code == 404, posted.text


def test_mention_notifies_only_users_who_can_see_parent(client, make_user, track):
    author = make_user(role="gestor")
    colleague = make_user(role="gestor")  # Gestor sees all companies → notified
    outsider = make_user(role="membro")  # unrelated Membro → cannot see → skipped
    company_id = _make_company(author.id, track)

    resp = _post_comment(
        client,
        _token(client, author.email),
        company_id,
        f"@{colleague.name} @{outsider.name} vejam isto",
        mentions=[colleague.id, outsider.id],
    )
    assert resp.status_code == 201, resp.text
    # Both mentions persisted (author sees who they tagged).
    assert set(resp.json()["mentions"]) == {str(colleague.id), str(outsider.id)}

    db = SessionLocal()
    try:
        colleague_notifs = db.execute(
            select(Notification).where(
                Notification.user_id == colleague.id,
                Notification.type == "mention",
                Notification.entity_id == company_id,
            )
        ).scalars().all()
        outsider_notifs = db.execute(
            select(Notification).where(
                Notification.user_id == outsider.id,
                Notification.type == "mention",
                Notification.entity_id == company_id,
            )
        ).scalars().all()
    finally:
        db.close()

    assert len(colleague_notifs) == 1  # visible mentioned user is notified
    assert outsider_notifs == []  # out-of-scope mentioned user is NOT notified


def test_author_can_edit_but_others_cannot(client, make_user, track):
    author = make_user(role="gestor")
    other = make_user(role="gestor")  # can see the company but is not the author
    company_id = _make_company(author.id, track)

    created = _post_comment(client, _token(client, author.email), company_id, "v1")
    comment_id = created.json()["id"]

    # Author edits — 200, becomes an edited comment (updatedAt advances).
    edited = client.patch(
        f"{API}/comments/{comment_id}",
        json={"body": "v2 corrigido", "mentions": []},
        headers=_auth(_token(client, author.email)),
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["body"] == "v2 corrigido"
    assert edited.json()["updatedAt"] != edited.json()["createdAt"]

    # A non-author who can see the parent gets 403 (not 404 — existence is known).
    denied = client.patch(
        f"{API}/comments/{comment_id}",
        json={"body": "hack", "mentions": []},
        headers=_auth(_token(client, other.email)),
    )
    assert denied.status_code == 403, denied.text


def test_delete_is_author_or_admin_only(client, make_user, track):
    author = make_user(role="gestor")
    other = make_user(role="gestor")
    admin = make_user(role="admin")
    company_id = _make_company(author.id, track)

    # Non-author, non-admin cannot delete → 403.
    c1 = _post_comment(client, _token(client, author.email), company_id, "a")
    id1 = c1.json()["id"]
    denied = client.delete(
        f"{API}/comments/{id1}", headers=_auth(_token(client, other.email))
    )
    assert denied.status_code == 403, denied.text

    # Admin can delete anyone's comment → 204.
    admin_del = client.delete(
        f"{API}/comments/{id1}", headers=_auth(_token(client, admin.email))
    )
    assert admin_del.status_code == 204, admin_del.text

    # Author can delete their own → 204.
    c2 = _post_comment(client, _token(client, author.email), company_id, "b")
    id2 = c2.json()["id"]
    own_del = client.delete(
        f"{API}/comments/{id2}", headers=_auth(_token(client, author.email))
    )
    assert own_del.status_code == 204, own_del.text


def test_edit_or_delete_missing_comment_is_404(client, make_user):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    missing = uuid.uuid4()

    patched = client.patch(
        f"{API}/comments/{missing}",
        json={"body": "x", "mentions": []},
        headers=_auth(token),
    )
    assert patched.status_code == 404, patched.text

    deleted = client.delete(f"{API}/comments/{missing}", headers=_auth(token))
    assert deleted.status_code == 404, deleted.text
