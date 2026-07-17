"""Integration tests for the proposals API (F6) against the real Postgres
(:5433).

Covers the happy paths (create → send → view → accept/reject/expire/resend),
the send prerequisites (BR-025), the terminal-state guards (BR-026), the archive
rules (BR-028: accepted cannot archive), the auto-expiry sweep (AUTO-04/BR-027),
and the Membro role-scoping boundary (BR-002 → 404).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog, Attachment, Notification
from app.models.crm import Company, Contact, Opportunity, Proposal
from app.services import proposal_service

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
    ids: dict[str, list[uuid.UUID]] = {
        "proposal": [],
        "attachment": [],
        "opportunity": [],
        "company": [],
        "contact": [],
    }
    yield ids
    db = SessionLocal()
    try:
        entity_ids = ids["proposal"] + ids["opportunity"] + ids["company"]
        if entity_ids:
            db.execute(delete(ActivityLog).where(ActivityLog.entity_id.in_(entity_ids)))
        if ids["proposal"]:
            db.execute(
                delete(Notification).where(Notification.entity_id.in_(ids["proposal"]))
            )
            db.execute(delete(Proposal).where(Proposal.id.in_(ids["proposal"])))
        if ids["opportunity"]:
            db.execute(
                delete(Opportunity).where(Opportunity.id.in_(ids["opportunity"]))
            )
        if ids["contact"]:
            db.execute(delete(Contact).where(Contact.id.in_(ids["contact"])))
        if ids["attachment"]:
            db.execute(delete(Attachment).where(Attachment.id.in_(ids["attachment"])))
        if ids["company"]:
            db.execute(delete(Company).where(Company.id.in_(ids["company"])))
        db.commit()
    finally:
        db.close()


def _add_attachment(track: dict) -> uuid.UUID:
    db = SessionLocal()
    try:
        att = Attachment(
            entity_type="proposal",
            entity_id=uuid.uuid4(),
            filename="proposta.pdf",
            mime_type="application/pdf",
            r2_key=f"proposals/{uuid.uuid4().hex}.pdf",
        )
        db.add(att)
        db.flush()
        aid = att.id
        db.commit()
        track["attachment"].append(aid)
        return aid
    finally:
        db.close()


def _create_company(client: TestClient, token: str, track: dict, **overrides) -> dict:
    body = {"name": f"Acme {uuid.uuid4().hex[:8]}", **overrides}
    resp = client.post(f"{API}/companies", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track["company"].append(uuid.UUID(data["id"]))
    return data


def _create_proposal(client: TestClient, token: str, track: dict, **overrides) -> dict:
    body = {"reference": f"PROP-{uuid.uuid4().hex[:10]}", **overrides}
    resp = client.post(f"{API}/proposals", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track["proposal"].append(uuid.UUID(data["id"]))
    return data


def _sendable(client: TestClient, token: str, track: dict, **overrides) -> dict:
    """A draft proposal that satisfies BR-025 send prerequisites."""
    return _create_proposal(
        client,
        token,
        track,
        value=1_800_000,
        valid_until=str(date.today() + timedelta(days=20)),
        pdf_attachment_id=str(_add_attachment(track)),
        **overrides,
    )


# --------------------------------------------------------------------------- #
# Create + permissions
# --------------------------------------------------------------------------- #
def test_gestor_creates_draft_proposal(client, make_user, track):
    gestor = make_user(role="gestor")
    data = _create_proposal(client, _token(client, gestor.email), track)
    assert data["status"] == "draft"
    assert data["archived_at"] is None
    assert data["created_date"] is not None  # defaulted to today


def test_membro_cannot_create_proposal(client, make_user, track):
    membro = make_user(role="membro")
    resp = client.post(
        f"{API}/proposals",
        json={"reference": f"PROP-{uuid.uuid4().hex[:8]}"},
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "GESTOR_REQUIRED"


def test_duplicate_reference_is_409(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    ref = f"PROP-{uuid.uuid4().hex[:10]}"
    _create_proposal(client, token, track, reference=ref)
    resp = client.post(
        f"{API}/proposals", json={"reference": ref}, headers=_auth(token)
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "PROPOSAL_REFERENCE_EXISTS"


# --------------------------------------------------------------------------- #
# Send — BR-025 prerequisites
# --------------------------------------------------------------------------- #
def test_send_without_prerequisites_is_422(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _create_proposal(client, token, track)  # no pdf/value/valid_until
    resp = client.post(
        f"{API}/proposals/{proposal['id']}/send", headers=_auth(token)
    )
    assert resp.status_code == 422
    body = resp.json()["error"]
    assert body["code"] == "PROPOSAL_SEND_REQUIREMENTS"
    assert set(body["details"]["missing"]) == {
        "pdf_attachment_id",
        "value",
        "valid_until",
    }


def test_send_with_prerequisites_sets_sent(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _sendable(client, token, track)
    resp = client.post(
        f"{API}/proposals/{proposal['id']}/send", headers=_auth(token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "sent"
    assert body["sent_date"] is not None


# --------------------------------------------------------------------------- #
# View / accept / reject — state machine (BR-026 terminal)
# --------------------------------------------------------------------------- #
def test_cannot_accept_a_draft(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _create_proposal(client, token, track)
    resp = client.post(
        f"{API}/proposals/{proposal['id']}/accept", headers=_auth(token)
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "PROPOSAL_INVALID_TRANSITION"


def test_full_happy_path_to_accepted(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _sendable(client, token, track)
    pid = proposal["id"]

    assert client.post(f"{API}/proposals/{pid}/send", headers=_auth(token)).status_code == 200
    viewed = client.post(f"{API}/proposals/{pid}/view", headers=_auth(token))
    assert viewed.status_code == 200
    assert viewed.json()["status"] == "viewed"
    accepted = client.post(f"{API}/proposals/{pid}/accept", headers=_auth(token))
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"


def test_accepted_cannot_be_updated(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _sendable(client, token, track)
    pid = proposal["id"]
    client.post(f"{API}/proposals/{pid}/send", headers=_auth(token))
    client.post(f"{API}/proposals/{pid}/accept", headers=_auth(token))

    resp = client.patch(
        f"{API}/proposals/{pid}", json={"notes": "changed"}, headers=_auth(token)
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "PROPOSAL_TERMINAL"


def test_reject_requires_note(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _sendable(client, token, track)
    pid = proposal["id"]
    client.post(f"{API}/proposals/{pid}/send", headers=_auth(token))

    missing = client.post(f"{API}/proposals/{pid}/reject", json={}, headers=_auth(token))
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "VALIDATION_ERROR"

    ok = client.post(
        f"{API}/proposals/{pid}/reject",
        json={"note": "Cliente escolheu outro fornecedor"},
        headers=_auth(token),
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "rejected"


# --------------------------------------------------------------------------- #
# Archive rules — BR-028 / H2
# --------------------------------------------------------------------------- #
def test_accepted_cannot_be_archived(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _sendable(client, token, track)
    pid = proposal["id"]
    client.post(f"{API}/proposals/{pid}/send", headers=_auth(token))
    client.post(f"{API}/proposals/{pid}/accept", headers=_auth(token))

    resp = client.post(f"{API}/proposals/{pid}/archive", headers=_auth(token))
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "PROPOSAL_ARCHIVE_BLOCKED"


def test_rejected_can_be_archived(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _sendable(client, token, track)
    pid = proposal["id"]
    client.post(f"{API}/proposals/{pid}/send", headers=_auth(token))
    client.post(
        f"{API}/proposals/{pid}/reject", json={"note": "não"}, headers=_auth(token)
    )
    resp = client.post(f"{API}/proposals/{pid}/archive", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["archived_at"] is not None


# --------------------------------------------------------------------------- #
# Resend — expired → sent
# --------------------------------------------------------------------------- #
def test_resend_expired_with_past_validity_is_422(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _sendable(client, token, track)
    pid = proposal["id"]
    client.post(f"{API}/proposals/{pid}/send", headers=_auth(token))
    client.post(f"{API}/proposals/{pid}/expire", headers=_auth(token))

    resp = client.post(
        f"{API}/proposals/{pid}/resend",
        json={"valid_until": str(date.today() - timedelta(days=1))},
        headers=_auth(token),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "PROPOSAL_VALIDITY_IN_PAST"


def test_resend_expired_returns_to_sent(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    proposal = _sendable(client, token, track)
    pid = proposal["id"]
    client.post(f"{API}/proposals/{pid}/send", headers=_auth(token))
    client.post(f"{API}/proposals/{pid}/expire", headers=_auth(token))

    resp = client.post(
        f"{API}/proposals/{pid}/resend",
        json={"valid_until": str(date.today() + timedelta(days=30))},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "sent"


# --------------------------------------------------------------------------- #
# Auto-expiry — AUTO-04 / BR-027
# --------------------------------------------------------------------------- #
def test_auto_expiry_marks_overdue_and_notifies(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    # Sendable proposal whose validity is already in the past.
    proposal = _create_proposal(
        client,
        token,
        track,
        value=500000,
        valid_until=str(date.today() - timedelta(days=2)),
        pdf_attachment_id=str(_add_attachment(track)),
    )
    pid = proposal["id"]
    client.post(f"{API}/proposals/{pid}/send", headers=_auth(token))

    # Run the AUTO-04 sweep (what the cron entrypoint invokes).
    db = SessionLocal()
    try:
        expired = proposal_service.expire_overdue_proposals(db)
        db.commit()
    finally:
        db.close()
    assert any(str(p.id) == pid for p in expired)

    got = client.get(f"{API}/proposals/{pid}", headers=_auth(token))
    assert got.json()["status"] == "expired"

    # Owner (creator, no linked opportunity) got a notification.
    db = SessionLocal()
    try:
        note = db.scalar(
            select(Notification).where(
                Notification.entity_id == uuid.UUID(pid),
                Notification.type == "proposal_expired",
            )
        )
        assert note is not None
        assert note.user_id == gestor.id
    finally:
        db.close()


def test_auto_expiry_is_idempotent_and_skips_terminal(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    # Accepted proposal past validity must NOT be expired (terminal, BR-026).
    proposal = _create_proposal(
        client,
        token,
        track,
        value=500000,
        valid_until=str(date.today() - timedelta(days=5)),
        pdf_attachment_id=str(_add_attachment(track)),
    )
    pid = proposal["id"]
    client.post(f"{API}/proposals/{pid}/send", headers=_auth(token))
    client.post(f"{API}/proposals/{pid}/accept", headers=_auth(token))

    db = SessionLocal()
    try:
        expired = proposal_service.expire_overdue_proposals(db)
        db.commit()
    finally:
        db.close()
    assert all(str(p.id) != pid for p in expired)

    got = client.get(f"{API}/proposals/{pid}", headers=_auth(token))
    assert got.json()["status"] == "accepted"


# --------------------------------------------------------------------------- #
# BR-002 role scoping
# --------------------------------------------------------------------------- #
def test_membro_get_non_scoped_proposal_is_404(client, make_user, track):
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    company = _create_company(client, _token(client, admin.email), track)
    proposal = _create_proposal(
        client, _token(client, admin.email), track, company_id=company["id"]
    )
    resp = client.get(
        f"{API}/proposals/{proposal['id']}",
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "PROPOSAL_NOT_FOUND"
