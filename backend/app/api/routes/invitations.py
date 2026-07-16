"""Invitation routes: admin/grant-gated create + public tokenized accept."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import RequireInviteCapability
from app.database.session import get_db
from app.schemas.auth import (
    InvitationAccept,
    InvitationCreate,
    InvitationResponse,
    UserResponse,
)
from app.services import invitation_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.post(
    "",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    payload: InvitationCreate,
    current_user: RequireInviteCapability,
    db: DbSession,
) -> InvitationResponse:
    invite, _raw_token = invitation_service.create_invitation(
        db, payload, invited_by=current_user
    )
    return InvitationResponse.model_validate(invite)


@router.post(
    "/accept",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def accept_invitation(payload: InvitationAccept, db: DbSession) -> UserResponse:
    # Public, tokenized — no auth. The token is the credential.
    user = invitation_service.accept_invitation(db, payload)
    return UserResponse.model_validate(user)
