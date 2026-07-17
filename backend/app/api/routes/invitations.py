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
    InvitationPublicResponse,
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


@router.get("/{token}", response_model=InvitationPublicResponse)
def get_invitation(token: str, db: DbSession) -> InvitationPublicResponse:
    """Public, tokenized metadata for the accept-invite screen (no auth).

    Unknown token → 404; a spent (accepted/revoked/expired) token → 410.
    """
    invite, inviter_name = invitation_service.get_invitation_by_token(db, token)
    return InvitationPublicResponse(
        email=invite.email,
        role=invite.role,
        invited_by=inviter_name,
        expires_at=invite.expires_at,
        status=invite.status,
    )
