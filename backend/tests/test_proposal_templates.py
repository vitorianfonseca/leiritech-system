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


# --------------------------------------------------------------------------- #
# Task 10 — schemas (pure)
# --------------------------------------------------------------------------- #
def test_template_create_schema_accepts_children():
    from app.schemas.proposal_templates import ItemInput, ProposalTemplateCreate

    payload = ProposalTemplateCreate(
        name="T",
        default_discount_bps=0,
        sections=[{"heading": "Intro", "body": "x"}],
        items=[
            ItemInput(
                name="Website", unit="fixed", unit_price=500000,
                tax_rate=Decimal("23.00"), billing_type="one_time",
                quantity=Decimal("1"),
            )
        ],
    )
    assert payload.items[0].unit_price == 500000
    assert payload.sections[0].heading == "Intro"


# --------------------------------------------------------------------------- #
# Task 11 — repository / service / routes (HTTP integration)
# --------------------------------------------------------------------------- #
def _create_template(client: TestClient, token: str, track: dict, **overrides) -> dict:
    body = {
        "name": f"Template {uuid.uuid4().hex[:8]}",
        "default_discount_bps": 0,
        "sections": [{"heading": "Intro", "body": "Olá {{cliente}}"}],
        "items": [
            {"name": "Website", "unit": "fixed", "unit_price": 500000,
             "tax_rate": "23.00", "billing_type": "one_time", "quantity": "1"},
            {"name": "Manutenção", "unit": "month", "unit_price": 20000,
             "tax_rate": "23.00", "billing_type": "monthly", "quantity": "1"},
        ],
        **overrides,
    }
    resp = client.post(f"{API}/proposal-templates", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track["template"].append(uuid.UUID(data["id"]))
    return data


def test_template_api_roundtrip_with_totals(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    data = _create_template(client, token, track)
    assert data["totals"]["one_time"]["net"] == 500000
    assert data["totals"]["monthly"]["net"] == 20000
    assert data["totals"]["value"] == 500000  # one-time net
    assert len(data["sections"]) == 1 and len(data["items"]) == 2


def test_template_update_replaces_items(client, make_user, track):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    data = _create_template(client, token, track)
    tid = data["id"]
    resp = client.patch(
        f"{API}/proposal-templates/{tid}", json={"items": []}, headers=_auth(token)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["items"] == []
    assert resp.json()["totals"]["value"] == 0


def test_membro_cannot_create_template(client, make_user):
    membro = make_user(role="membro")
    token = _token(client, membro.email)
    resp = client.post(
        f"{API}/proposal-templates",
        json={"name": "x", "default_discount_bps": 0},
        headers=_auth(token),
    )
    assert resp.status_code == 403
