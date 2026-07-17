"""Proposal routes (F6 — metadata + PDF lifecycle, BR-025..028).

Viewing is available to any authenticated user (scoped for a Membro, BR-002);
create/edit, every lifecycle transition (send/view/accept/reject/expire/resend)
and archive/restore require Gestor+. Business rules — send prerequisites
(BR-025), terminal states (BR-026), auto-expiry (BR-027), archive rules
(BR-028) — live in ``proposal_service``; these handlers only wire HTTP to the
service.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.proposals import (
    ProposalCreate,
    ProposalReject,
    ProposalResend,
    ProposalResponse,
    ProposalStatus,
    ProposalUpdate,
)
from app.services import proposal_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[ProposalResponse])
def list_proposals(
    user: CurrentUser,
    db: DbSession,
    opportunity_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    status_filter: Annotated[ProposalStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    include_archived: bool = False,
    sort: Annotated[
        str, Query(pattern="^-?(reference|created_at|valid_until)$")
    ] = "-created_at",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[ProposalResponse]:
    proposals, total = proposal_service.list_proposals(
        db,
        user,
        opportunity_id=opportunity_id,
        company_id=company_id,
        status=status_filter,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[ProposalResponse.model_validate(p) for p in proposals],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
def create_proposal(
    payload: ProposalCreate,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.create_proposal(db, user, payload)
    return ProposalResponse.model_validate(proposal)


@router.get("/{proposal_id}", response_model=ProposalResponse)
def get_proposal(
    proposal_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.get_proposal_or_404(db, user, proposal_id)
    return ProposalResponse.model_validate(proposal)


@router.patch("/{proposal_id}", response_model=ProposalResponse)
def update_proposal(
    proposal_id: uuid.UUID,
    payload: ProposalUpdate,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.update_proposal(db, user, proposal_id, payload)
    return ProposalResponse.model_validate(proposal)


@router.post("/{proposal_id}/send", response_model=ProposalResponse)
def send_proposal(
    proposal_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.send_proposal(db, user, proposal_id)
    return ProposalResponse.model_validate(proposal)


@router.post("/{proposal_id}/view", response_model=ProposalResponse)
def view_proposal(
    proposal_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.mark_viewed(db, user, proposal_id)
    return ProposalResponse.model_validate(proposal)


@router.post("/{proposal_id}/accept", response_model=ProposalResponse)
def accept_proposal(
    proposal_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.accept_proposal(db, user, proposal_id)
    return ProposalResponse.model_validate(proposal)


@router.post("/{proposal_id}/reject", response_model=ProposalResponse)
def reject_proposal(
    proposal_id: uuid.UUID,
    payload: ProposalReject,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.reject_proposal(db, user, proposal_id, payload)
    return ProposalResponse.model_validate(proposal)


@router.post("/{proposal_id}/expire", response_model=ProposalResponse)
def expire_proposal(
    proposal_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.expire_proposal(db, user, proposal_id)
    return ProposalResponse.model_validate(proposal)


@router.post("/{proposal_id}/resend", response_model=ProposalResponse)
def resend_proposal(
    proposal_id: uuid.UUID,
    payload: ProposalResend,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.resend_proposal(db, user, proposal_id, payload)
    return ProposalResponse.model_validate(proposal)


@router.post("/{proposal_id}/archive", response_model=ProposalResponse)
def archive_proposal(
    proposal_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.archive_proposal(db, user, proposal_id)
    return ProposalResponse.model_validate(proposal)


@router.post("/{proposal_id}/restore", response_model=ProposalResponse)
def restore_proposal(
    proposal_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ProposalResponse:
    proposal = proposal_service.restore_proposal(db, user, proposal_id)
    return ProposalResponse.model_validate(proposal)
