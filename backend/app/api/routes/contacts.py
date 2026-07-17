"""Contact routes (CRM F4). View scoped for Membro (BR-002); mutations Gestor+."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.crm import (
    ContactCreate,
    ContactResponse,
    ContactStatus,
    ContactUpdate,
)
from app.services import contact_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[ContactResponse])
def list_contacts(
    user: CurrentUser,
    db: DbSession,
    status_filter: Annotated[ContactStatus | None, Query(alias="status")] = None,
    company_id: uuid.UUID | None = None,
    owner_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    include_archived: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[ContactResponse]:
    contacts, total = contact_service.list_contacts(
        db,
        user,
        status=status_filter,
        company_id=company_id,
        owner_id=owner_id,
        q=q,
        include_archived=include_archived,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[ContactResponse.model_validate(c) for c in contacts],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def create_contact(
    payload: ContactCreate,
    user: RequireGestor,
    db: DbSession,
) -> ContactResponse:
    contact = contact_service.create_contact(db, user, payload)
    return ContactResponse.model_validate(contact)


@router.get("/{contact_id}", response_model=ContactResponse)
def get_contact(
    contact_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> ContactResponse:
    contact = contact_service.get_contact_or_404(db, user, contact_id)
    return ContactResponse.model_validate(contact)


@router.patch("/{contact_id}", response_model=ContactResponse)
def update_contact(
    contact_id: uuid.UUID,
    payload: ContactUpdate,
    user: RequireGestor,
    db: DbSession,
) -> ContactResponse:
    contact = contact_service.update_contact(db, user, contact_id, payload)
    return ContactResponse.model_validate(contact)


@router.post("/{contact_id}/archive", response_model=ContactResponse)
def archive_contact(
    contact_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ContactResponse:
    contact = contact_service.archive_contact(db, user, contact_id)
    return ContactResponse.model_validate(contact)


@router.post("/{contact_id}/restore", response_model=ContactResponse)
def restore_contact(
    contact_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ContactResponse:
    contact = contact_service.restore_contact(db, user, contact_id)
    return ContactResponse.model_validate(contact)
