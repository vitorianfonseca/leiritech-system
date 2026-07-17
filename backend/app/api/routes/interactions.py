"""Interaction (timeline) routes (CRM F4).

Any authenticated user may log an interaction, but a Membro only on entities
within their own project scope (enforced in the service, matrix §3). Reads are
scoped for a Membro (BR-002).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.crm import InteractionCreate, InteractionResponse
from app.services import interaction_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=InteractionResponse, status_code=status.HTTP_201_CREATED)
def create_interaction(
    payload: InteractionCreate,
    user: CurrentUser,
    db: DbSession,
) -> InteractionResponse:
    interaction = interaction_service.create_interaction(db, user, payload)
    return InteractionResponse.model_validate(interaction)


@router.get("", response_model=Page[InteractionResponse])
def list_interactions(
    user: CurrentUser,
    db: DbSession,
    company_id: uuid.UUID | None = None,
    contact_id: uuid.UUID | None = None,
    opportunity_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[InteractionResponse]:
    interactions, total = interaction_service.list_interactions(
        db,
        user,
        company_id=company_id,
        contact_id=contact_id,
        opportunity_id=opportunity_id,
        project_id=project_id,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[InteractionResponse.model_validate(i) for i in interactions],
        total=total,
        page=page,
        page_size=page_size,
    )
