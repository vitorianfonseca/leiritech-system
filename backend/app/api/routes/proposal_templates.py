"""Proposal-template routes. Reads: any authenticated user. Writes: Gestor+.
Handlers wire HTTP to ``proposal_template_service``; the service owns the ORM,
the replace-on-save semantics and the computed totals block.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.proposal_templates import (
    ProposalTemplateCreate,
    ProposalTemplateResponse,
    ProposalTemplateUpdate,
)
from app.services import proposal_template_service as svc

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[ProposalTemplateResponse])
def list_templates(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    include_archived: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[ProposalTemplateResponse]:
    rows, total = svc.list_templates(
        db, user, q=q, include_archived=include_archived, page=page, page_size=page_size
    )
    return Page(
        items=[svc.to_response(t) for t in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "", response_model=ProposalTemplateResponse, status_code=status.HTTP_201_CREATED
)
def create_template(
    payload: ProposalTemplateCreate, user: RequireGestor, db: DbSession
) -> ProposalTemplateResponse:
    return svc.to_response(svc.create_template(db, user, payload))


@router.get("/{template_id}", response_model=ProposalTemplateResponse)
def get_template(
    template_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ProposalTemplateResponse:
    return svc.to_response(svc.get_or_404(db, template_id))


@router.patch("/{template_id}", response_model=ProposalTemplateResponse)
def update_template(
    template_id: uuid.UUID,
    payload: ProposalTemplateUpdate,
    user: RequireGestor,
    db: DbSession,
) -> ProposalTemplateResponse:
    return svc.to_response(svc.update_template(db, user, template_id, payload))


@router.post("/{template_id}/archive", response_model=ProposalTemplateResponse)
def archive_template(
    template_id: uuid.UUID, user: RequireGestor, db: DbSession
) -> ProposalTemplateResponse:
    return svc.to_response(svc.archive_template(db, user, template_id))


@router.post("/{template_id}/restore", response_model=ProposalTemplateResponse)
def restore_template(
    template_id: uuid.UUID, user: RequireGestor, db: DbSession
) -> ProposalTemplateResponse:
    return svc.to_response(svc.restore_template(db, user, template_id))
