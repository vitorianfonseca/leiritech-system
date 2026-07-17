"""Catalog business logic. Writes are Gestor+ (enforced at the route); reads are
open to any authenticated user. The service owns not-found (404) and the archive
soft-delete marker so route handlers stay thin.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core import errors
from app.models.catalog import CatalogItem
from app.models.user import User
from app.repositories import catalog as catalog_repo
from app.schemas.catalog import CatalogItemCreate, CatalogItemUpdate


def get_or_404(db: Session, item_id: uuid.UUID) -> CatalogItem:
    item = catalog_repo.get(db, item_id)
    if item is None:
        raise errors.not_found("Item de catálogo não encontrado.", code="CATALOG_ITEM_NOT_FOUND")
    return item


def list_items(db: Session, user: User, **filters) -> tuple[list[CatalogItem], int]:
    return catalog_repo.list_items(db, **filters)


def create_item(db: Session, user: User, payload: CatalogItemCreate) -> CatalogItem:
    item = CatalogItem(created_by=user.id, **payload.model_dump())
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def update_item(
    db: Session, user: User, item_id: uuid.UUID, payload: CatalogItemUpdate
) -> CatalogItem:
    item = get_or_404(db, item_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.flush()
    db.refresh(item)
    return item


def archive_item(db: Session, user: User, item_id: uuid.UUID) -> CatalogItem:
    item = get_or_404(db, item_id)
    item.archived_at = datetime.now(UTC)
    db.flush()
    db.refresh(item)
    return item


def restore_item(db: Session, user: User, item_id: uuid.UUID) -> CatalogItem:
    item = get_or_404(db, item_id)
    item.archived_at = None
    db.flush()
    db.refresh(item)
    return item
