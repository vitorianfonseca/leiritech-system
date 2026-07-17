"""Integration tests for the product/service catalog (against the real
Postgres on :5433). Follows the house pattern: HTTP via ``client`` +
``make_user``, cleanup by id via ``track``. Money is integer EUR cents.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models import enums

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
    ids: dict[str, list[uuid.UUID]] = {"catalog": []}
    yield ids
    from app.models.catalog import CatalogItem

    db = SessionLocal()
    try:
        if ids["catalog"]:
            db.execute(delete(CatalogItem).where(CatalogItem.id.in_(ids["catalog"])))
        db.commit()
    finally:
        db.close()


def _create_item(client: TestClient, token: str, track: dict, **overrides) -> dict:
    body = {
        "name": f"Item {uuid.uuid4().hex[:8]}",
        "unit": "unit",
        "unit_price": 1000,
        "billing_type": "one_time",
        **overrides,
    }
    resp = client.post(f"{API}/catalog-items", json=body, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    track["catalog"].append(uuid.UUID(data["id"]))
    return data


# --------------------------------------------------------------------------- #
# Task 1 — enums
# --------------------------------------------------------------------------- #
def test_catalog_enums_exist():
    assert enums.CATALOG_UNITS == (
        "unit", "hour", "day", "month", "m2", "license", "fixed"
    )
    assert enums.BILLING_TYPES == ("one_time", "monthly", "annual")


# --------------------------------------------------------------------------- #
# Task 2 — model persistence (direct SessionLocal, mirrors _add_attachment)
# --------------------------------------------------------------------------- #
def test_catalog_item_persists():
    from decimal import Decimal

    from app.models.catalog import CatalogItem

    db = SessionLocal()
    created: uuid.UUID | None = None
    try:
        item = CatalogItem(
            name="Licença anual",
            unit="license",
            unit_price=120000,  # €1200.00
            tax_rate=Decimal("23.00"),
            billing_type="annual",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        created = item.id
        assert item.id is not None
        assert item.archived_at is None
        assert item.unit_price == 120000
    finally:
        if created is not None:
            db.execute(delete(CatalogItem).where(CatalogItem.id == created))
            db.commit()
        db.close()


# --------------------------------------------------------------------------- #
# Task 3 — schemas (pure)
# --------------------------------------------------------------------------- #
def test_catalog_create_rejects_negative_price():
    from pydantic import ValidationError

    from app.schemas.catalog import CatalogItemCreate

    with pytest.raises(ValidationError):
        CatalogItemCreate(
            name="x", unit="unit", unit_price=-1, billing_type="one_time"
        )


def test_catalog_create_defaults_tax_23():
    from app.schemas.catalog import CatalogItemCreate

    payload = CatalogItemCreate(
        name="x", unit="unit", unit_price=1000, billing_type="one_time"
    )
    assert str(payload.tax_rate) == "23.00"


# --------------------------------------------------------------------------- #
# Task 4 — repository (direct SessionLocal)
# --------------------------------------------------------------------------- #
def test_list_items_filters_and_search():
    from app.models.catalog import CatalogItem
    from app.repositories import catalog as catalog_repo

    db = SessionLocal()
    created: list[uuid.UUID] = []
    try:
        marker = uuid.uuid4().hex[:8]
        a = CatalogItem(
            name=f"Website institucional {marker}", unit="fixed",
            unit_price=500000, billing_type="one_time", category=f"web-{marker}",
        )
        b = CatalogItem(
            name=f"Manutenção mensal {marker}", unit="month",
            unit_price=20000, billing_type="monthly", category=f"ops-{marker}",
        )
        db.add_all([a, b])
        db.commit()
        created = [a.id, b.id]

        rows, total = catalog_repo.list_items(
            db, q=f"website institucional {marker}", category=None,
            billing_type=None, include_archived=False, sort="name",
            page=1, page_size=20,
        )
        assert total == 1 and rows[0].name.startswith("Website")

        rows, total = catalog_repo.list_items(
            db, q=None, category=f"ops-{marker}", billing_type="monthly",
            include_archived=False, sort="name", page=1, page_size=20,
        )
        assert total == 1 and rows[0].billing_type == "monthly"
    finally:
        if created:
            db.execute(delete(CatalogItem).where(CatalogItem.id.in_(created)))
            db.commit()
        db.close()
