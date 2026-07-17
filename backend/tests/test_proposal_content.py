"""Integration tests for proposal structured content + template instantiation
(against the real Postgres on :5433). HTTP via ``client`` + ``make_user``;
cleanup by id via ``track``.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal

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
        "template": [],
        "company": [],
    }
    yield ids
    from app.models.collaboration import ActivityLog, Notification
    from app.models.crm import Company, Proposal
    from app.models.proposal_content import ProposalTemplate

    db = SessionLocal()
    try:
        entity_ids = ids["proposal"] + ids["company"]
        if entity_ids:
            db.execute(delete(ActivityLog).where(ActivityLog.entity_id.in_(entity_ids)))
        if ids["proposal"]:
            db.execute(
                delete(Notification).where(Notification.entity_id.in_(ids["proposal"]))
            )
            db.execute(delete(Proposal).where(Proposal.id.in_(ids["proposal"])))
        if ids["template"]:
            db.execute(
                delete(ProposalTemplate).where(ProposalTemplate.id.in_(ids["template"]))
            )
        if ids["company"]:
            db.execute(delete(Company).where(Company.id.in_(ids["company"])))
        db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Task 12 — model persistence (direct SessionLocal)
# --------------------------------------------------------------------------- #
def test_proposal_content_persists():
    from app.models.crm import Proposal
    from app.models.proposal_content import ProposalItem, ProposalSection

    db = SessionLocal()
    created: uuid.UUID | None = None
    try:
        p = Proposal(
            reference=f"PROP-CONTENT-{uuid.uuid4().hex[:8]}",
            status="draft",
            discount_bps=0,
        )
        p.sections = [ProposalSection(position=0, heading="Intro", body="Olá Ana")]
        p.items = [
            ProposalItem(
                position=0, name="Website", unit="fixed", unit_price=500000,
                tax_rate=Decimal("23.00"), billing_type="one_time",
                quantity=Decimal("1"),
            )
        ]
        db.add(p)
        db.commit()
        db.refresh(p)
        created = p.id
        assert p.items[0].unit_price == 500000
        assert p.sections[0].heading == "Intro"
    finally:
        if created is not None:
            db.execute(delete(Proposal).where(Proposal.id == created))
            db.commit()
        db.close()
