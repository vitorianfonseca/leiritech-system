"""Catalog data-access layer. Services call these; route handlers never touch
the ORM directly.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models.catalog import CatalogItem


def get(db: Session, item_id: uuid.UUID) -> CatalogItem | None:
    return db.get(CatalogItem, item_id)


def _sort(sort: str):
    mapping = {
        "name": CatalogItem.name.asc(),
        "-name": CatalogItem.name.desc(),
        "created_at": CatalogItem.created_at.asc(),
        "-created_at": CatalogItem.created_at.desc(),
        "unit_price": CatalogItem.unit_price.asc(),
        "-unit_price": CatalogItem.unit_price.desc(),
    }
    return mapping.get(sort, CatalogItem.name.asc())


def _paginate(
    db: Session, stmt: Select, *, page: int, page_size: int
) -> tuple[list[CatalogItem], int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars()
    )
    return rows, total


def list_items(
    db: Session,
    *,
    q: str | None,
    category: str | None,
    billing_type: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[CatalogItem], int]:
    stmt = select(CatalogItem)
    if not include_archived:
        stmt = stmt.where(CatalogItem.archived_at.is_(None))
    if category:
        stmt = stmt.where(CatalogItem.category == category)
    if billing_type:
        stmt = stmt.where(CatalogItem.billing_type == billing_type)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(CatalogItem.name.ilike(like), CatalogItem.category.ilike(like))
        )
    stmt = stmt.order_by(_sort(sort))
    return _paginate(db, stmt, page=page, page_size=page_size)
