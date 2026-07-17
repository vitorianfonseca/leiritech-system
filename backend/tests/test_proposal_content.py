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


# --------------------------------------------------------------------------- #
# Task 13 — instantiation, snapshot integrity, value recompute (service level)
# --------------------------------------------------------------------------- #
def _make_template(db, user):
    from app.schemas.proposal_templates import ProposalTemplateCreate
    from app.services import proposal_template_service

    return proposal_template_service.create_template(
        db,
        user,
        ProposalTemplateCreate(
            name=f"T {uuid.uuid4().hex[:6]}",
            default_validity_days=30,
            default_discount_bps=0,
            terms="Termos para {{cliente}}",
            sections=[{"heading": "Intro", "body": "Olá {{cliente}}"}],
            items=[
                {"name": "Website", "unit": "fixed", "unit_price": 500000,
                 "tax_rate": "23.00", "billing_type": "one_time", "quantity": "1"}
            ],
        ),
    )


def test_apply_template_snapshots_and_recomputes_value(make_user, track):
    from app.models.crm import Company
    from app.schemas.proposal_templates import ProposalTemplateUpdate
    from app.schemas.proposals import ProposalCreate
    from app.services import proposal_service, proposal_template_service

    gestor = make_user(role="gestor")
    db = SessionLocal()
    try:
        company = Company(name=f"ACME {uuid.uuid4().hex[:6]}")
        db.add(company)
        db.flush()
        track["company"].append(company.id)

        tpl = _make_template(db, gestor)
        track["template"].append(tpl.id)

        proposal = proposal_service.create_proposal(
            db, gestor,
            ProposalCreate(reference=f"PROP-X-{uuid.uuid4().hex[:8]}", company_id=company.id),
        )
        track["proposal"].append(proposal.id)

        proposal = proposal_service.apply_template(db, gestor, proposal.id, tpl.id)
        assert proposal.value == 500000                    # one-time net recomputed
        assert proposal.sections[0].body == f"Olá {company.name}"  # placeholder resolved
        assert proposal.terms == f"Termos para {company.name}"
        assert proposal.valid_until is not None            # from default_validity_days

        # mutating the template afterwards does NOT change the proposal (snapshot)
        proposal_template_service.update_template(
            db, gestor, tpl.id, ProposalTemplateUpdate(items=[])
        )
        db.flush()
        db.refresh(proposal)
        assert proposal.items[0].unit_price == 500000
        db.commit()
    finally:
        db.close()


def test_apply_template_on_non_draft_conflicts(make_user, track):
    from app.core.errors import ApiError
    from app.models.crm import Company
    from app.schemas.proposals import ProposalCreate
    from app.services import proposal_service

    gestor = make_user(role="gestor")
    db = SessionLocal()
    try:
        company = Company(name=f"ACME {uuid.uuid4().hex[:6]}")
        db.add(company)
        db.flush()
        track["company"].append(company.id)

        tpl = _make_template(db, gestor)
        track["template"].append(tpl.id)

        proposal = proposal_service.create_proposal(
            db, gestor,
            ProposalCreate(reference=f"PROP-S-{uuid.uuid4().hex[:8]}", company_id=company.id),
        )
        track["proposal"].append(proposal.id)
        proposal.status = "sent"  # force a non-draft state
        db.flush()

        with pytest.raises(ApiError) as exc:
            proposal_service.apply_template(db, gestor, proposal.id, tpl.id)
        assert exc.value.status_code == 409
        db.commit()
    finally:
        db.close()
