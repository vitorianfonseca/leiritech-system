"""Opportunity routes (commercial pipeline F5, won→project handoff F7).

Viewing is available to any authenticated user (scoped for a Membro, BR-002);
create/edit and every lifecycle action (move/win/lose/convert) require Gestor+.
Business rules — próxima-ação (BR-010), lost-reason (BR-011), no-revert
(BR-013), won→project prefill (BR-035..038) — live in ``opportunity_service``;
these handlers only wire HTTP to the service.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.pipeline import (
    ConversionPrefill,
    OpportunityCreate,
    OpportunityLose,
    OpportunityMove,
    OpportunityOutcome,
    OpportunityResponse,
    OpportunityUpdate,
    OpportunityWin,
)
from app.services import opportunity_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[OpportunityResponse])
def list_opportunities(
    user: CurrentUser,
    db: DbSession,
    stage_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    owner_id: uuid.UUID | None = None,
    outcome: Annotated[OpportunityOutcome | None, Query()] = None,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    include_archived: bool = False,
    sort: Annotated[
        str, Query(pattern="^-?(title|created_at|expected_close_date)$")
    ] = "-created_at",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[OpportunityResponse]:
    opps, total = opportunity_service.list_opportunities(
        db,
        user,
        stage_id=stage_id,
        company_id=company_id,
        owner_id=owner_id,
        outcome=outcome,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[OpportunityResponse.model_validate(o) for o in opps],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=OpportunityResponse, status_code=status.HTTP_201_CREATED)
def create_opportunity(
    payload: OpportunityCreate,
    user: RequireGestor,
    db: DbSession,
) -> OpportunityResponse:
    opp = opportunity_service.create_opportunity(db, user, payload)
    return OpportunityResponse.model_validate(opp)


@router.get("/{opportunity_id}", response_model=OpportunityResponse)
def get_opportunity(
    opportunity_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> OpportunityResponse:
    opp = opportunity_service.get_opportunity_or_404(db, user, opportunity_id)
    return OpportunityResponse.model_validate(opp)


@router.patch("/{opportunity_id}", response_model=OpportunityResponse)
def update_opportunity(
    opportunity_id: uuid.UUID,
    payload: OpportunityUpdate,
    user: RequireGestor,
    db: DbSession,
) -> OpportunityResponse:
    opp = opportunity_service.update_opportunity(db, user, opportunity_id, payload)
    return OpportunityResponse.model_validate(opp)


@router.post("/{opportunity_id}/move", response_model=OpportunityResponse)
def move_opportunity(
    opportunity_id: uuid.UUID,
    payload: OpportunityMove,
    user: RequireGestor,
    db: DbSession,
) -> OpportunityResponse:
    opp = opportunity_service.move_opportunity(db, user, opportunity_id, payload)
    return OpportunityResponse.model_validate(opp)


@router.post("/{opportunity_id}/win", response_model=OpportunityResponse)
def win_opportunity(
    opportunity_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
    payload: OpportunityWin | None = None,
) -> OpportunityResponse:
    opp = opportunity_service.win_opportunity(
        db, user, opportunity_id, payload or OpportunityWin()
    )
    return OpportunityResponse.model_validate(opp)


@router.post("/{opportunity_id}/lose", response_model=OpportunityResponse)
def lose_opportunity(
    opportunity_id: uuid.UUID,
    payload: OpportunityLose,
    user: RequireGestor,
    db: DbSession,
) -> OpportunityResponse:
    opp = opportunity_service.lose_opportunity(db, user, opportunity_id, payload)
    return OpportunityResponse.model_validate(opp)


@router.post("/{opportunity_id}/convert", response_model=ConversionPrefill)
def convert_opportunity(
    opportunity_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ConversionPrefill:
    return opportunity_service.convert_opportunity(db, user, opportunity_id)
