"""Tests for the public invitation-by-token metadata read (Postgres :5433).

``GET /invitations/{token}`` backs the accept-invite screen: it is unauthenticated
and returns only the minimal metadata the screen renders. A valid pending token
yields the invite; a spent one (accepted/revoked/expired) is 410; an unknown token
is 404 (enumeration-safe).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete

from app.core import security
from app.database.session import SessionLocal
from app.models.user import Invitation

API = "/api/v1"


@pytest.fixture
def track_invites() -> Iterator[list[uuid.UUID]]:
    ids: list[uuid.UUID] = []
    yield ids
    db = SessionLocal()
    try:
        if ids:
            db.execute(delete(Invitation).where(Invitation.id.in_(ids)))
            db.commit()
    finally:
        db.close()


def _make_invite(
    track: list[uuid.UUID],
    *,
    status: str = "pending",
    expires_in: timedelta = timedelta(days=1),
    invited_by: uuid.UUID | None = None,
    email: str | None = None,
    role: str = "membro",
) -> str:
    """Insert an invitation with a known raw token; return the raw token."""
    raw = security.generate_url_token()
    db = SessionLocal()
    try:
        invite = Invitation(
            email=email or f"invitee-{uuid.uuid4().hex[:8]}@example.com",
            role=role,
            token_hash=security.hash_token(raw),
            status=status,
            expires_at=datetime.now(tz=UTC) + expires_in,
            invited_by=invited_by,
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)
        track.append(invite.id)
        return raw
    finally:
        db.close()


def test_valid_pending_invite_returns_metadata(client, make_user, track_invites) -> None:
    admin = make_user(role="admin")
    raw = _make_invite(
        track_invites, invited_by=admin.id, email="hire@example.com", role="gestor"
    )

    resp = client.get(f"{API}/invitations/{raw}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == "hire@example.com"
    assert body["role"] == "gestor"
    assert body["invited_by"] == admin.name  # inviter display name
    assert body["status"] == "pending"
    # Never leaks ids or grant flags.
    assert "id" not in body
    assert "token_hash" not in body


def test_unknown_token_is_404(client) -> None:
    resp = client.get(f"{API}/invitations/{security.generate_url_token()}")
    assert resp.status_code == 404, resp.text


def test_expired_token_is_410(client, track_invites) -> None:
    raw = _make_invite(track_invites, expires_in=timedelta(seconds=-10))
    resp = client.get(f"{API}/invitations/{raw}")
    assert resp.status_code == 410, resp.text
    assert resp.json()["error"]["code"] == "INVITATION_EXPIRED"


def test_accepted_token_is_410(client, track_invites) -> None:
    raw = _make_invite(track_invites, status="accepted")
    resp = client.get(f"{API}/invitations/{raw}")
    assert resp.status_code == 410, resp.text
    assert resp.json()["error"]["code"] == "INVITATION_ALREADY_ACCEPTED"


def test_revoked_token_is_410(client, track_invites) -> None:
    raw = _make_invite(track_invites, status="revoked")
    resp = client.get(f"{API}/invitations/{raw}")
    assert resp.status_code == 410, resp.text
    assert resp.json()["error"]["code"] == "INVITATION_REVOKED"


def test_invite_read_needs_no_auth(client, track_invites) -> None:
    raw = _make_invite(track_invites)
    # No Authorization header — the token is the credential.
    resp = client.get(f"{API}/invitations/{raw}")
    assert resp.status_code == 200, resp.text
