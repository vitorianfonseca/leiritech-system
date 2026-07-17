"""Catalog routes. Reads: any authenticated user. Writes: Gestor+. Handlers
only wire HTTP to ``catalog_service`` — the ORM lives behind the service.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.catalog import (
    BillingType,
    CatalogItemCreate,
    CatalogItemResponse,
    CatalogItemUpdate,
)
from app.schemas.common import Page
from app.services import catalog_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[CatalogItemResponse])
def list_catalog_items(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    category: str | None = None,
    billing_type: Annotated[BillingType | None, Query()] = None,
    include_archived: bool = False,
    sort: Annotated[str, Query(pattern="^-?(name|created_at|unit_price)$")] = "name",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[CatalogItemResponse]:
    items, total = catalog_service.list_items(
        db,
        user,
        q=q,
        category=category,
        billing_type=billing_type,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[CatalogItemResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "", response_model=CatalogItemResponse, status_code=status.HTTP_201_CREATED
)
def create_catalog_item(
    payload: CatalogItemCreate, user: RequireGestor, db: DbSession
) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(
        catalog_service.create_item(db, user, payload)
    )


@router.get("/{item_id}", response_model=CatalogItemResponse)
def get_catalog_item(
    item_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(
        catalog_service.get_or_404(db, item_id)
    )


@router.patch("/{item_id}", response_model=CatalogItemResponse)
def update_catalog_item(
    item_id: uuid.UUID,
    payload: CatalogItemUpdate,
    user: RequireGestor,
    db: DbSession,
) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(
        catalog_service.update_item(db, user, item_id, payload)
    )


@router.post("/{item_id}/archive", response_model=CatalogItemResponse)
def archive_catalog_item(
    item_id: uuid.UUID, user: RequireGestor, db: DbSession
) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(
        catalog_service.archive_item(db, user, item_id)
    )


@router.post("/{item_id}/restore", response_model=CatalogItemResponse)
def restore_catalog_item(
    item_id: uuid.UUID, user: RequireGestor, db: DbSession
) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(
        catalog_service.restore_item(db, user, item_id)
    )
