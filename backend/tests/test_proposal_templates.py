"""Integration tests for proposal templates (against the real Postgres on
:5433). HTTP via ``client`` + ``make_user``; cleanup by id via ``track``.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
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
    ids: dict[str, list[uuid.UUID]] = {"template": []}
    yield ids
    from app.models.proposal_content import ProposalTemplate

    db = SessionLocal()
    try:
        if ids["template"]:
            db.execute(
                delete(ProposalTemplate).where(ProposalTemplate.id.in_(ids["template"]))
            )
        db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Task 9 — model persistence (direct SessionLocal)
# --------------------------------------------------------------------------- #
def test_template_with_children_persists():
    from app.models.proposal_content import (
        ProposalTemplate,
        ProposalTemplateItem,
        ProposalTemplateSection,
    )

    db = SessionLocal()
    created: uuid.UUID | None = None
    try:
        tpl = ProposalTemplate(
            name="Website + Manutenção",
            default_validity_days=30,
            default_discount_bps=0,
            terms="Pagamento a 30 dias.",
        )
        tpl.sections = [
            ProposalTemplateSection(position=0, heading="Introdução", body="Olá {{cliente}}")
        ]
        tpl.items = [
            ProposalTemplateItem(
                position=0, name="Website", unit="fixed", unit_price=500000,
                tax_rate=Decimal("23.00"), billing_type="one_time",
                quantity=Decimal("1"),
            )
        ]
        db.add(tpl)
        db.commit()
        db.refresh(tpl)
        created = tpl.id
        assert tpl.id is not None
        assert tpl.sections[0].heading == "Introdução"
        assert tpl.items[0].unit_price == 500000
    finally:
        if created is not None:
            db.execute(delete(ProposalTemplate).where(ProposalTemplate.id == created))
            db.commit()
        db.close()
