"""Invitation routes: admin/grant-gated create + public tokenized accept."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import RequireInviteCapability
from app.core import errors
from app.core.config import settings
from app.core.rate_limit import SlidingWindowRateLimiter, client_ip
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

# audit H1: both endpoints below are public + tokenized (no auth) — throttle
# per-ip against token guessing / enumeration.
accept_invitation_rate_limiter = SlidingWindowRateLimiter(
    settings.PUBLIC_TOKEN_RATE_LIMIT_PER_MINUTE
)
get_invitation_rate_limiter = SlidingWindowRateLimiter(
    settings.PUBLIC_TOKEN_RATE_LIMIT_PER_MINUTE
)

# issue #48: creating an invitation sends an email. The endpoint is admin/grant
# gated, but a compromised (or careless) grant-holder could still drive outbound
# mail at will and burn the sending domain's reputation. Keyed on the INVITING
# user so one account's burst cannot spend everyone else's budget.
create_invitation_rate_limiter = SlidingWindowRateLimiter(
    settings.INVITE_SEND_RATE_LIMIT_PER_MINUTE
)


def _client_ip(request: Request) -> str:
    """Proxy-aware client address (see core.rate_limit.client_ip)."""
    return client_ip(request)


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
    if not create_invitation_rate_limiter.check(str(current_user.id)):
        raise errors.too_many_requests()
    invite, _raw_token = invitation_service.create_invitation(
        db, payload, invited_by=current_user
    )
    return InvitationResponse.model_validate(invite)


@router.post(
    "/accept",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def accept_invitation(
    request: Request, payload: InvitationAccept, db: DbSession
) -> UserResponse:
    # Public, tokenized — no auth. The token is the credential.
    if not accept_invitation_rate_limiter.check(_client_ip(request)):
        raise errors.too_many_requests()
    user = invitation_service.accept_invitation(db, payload)
    return UserResponse.model_validate(user)


@router.get("/{token}", response_model=InvitationPublicResponse)
def get_invitation(
    request: Request, token: str, db: DbSession
) -> InvitationPublicResponse:
    """Public, tokenized metadata for the accept-invite screen (no auth).

    Unknown token → 404; a spent (accepted/revoked/expired) token → 410.
    """
    if not get_invitation_rate_limiter.check(_client_ip(request)):
        raise errors.too_many_requests()
    invite, inviter_name = invitation_service.get_invitation_by_token(db, token)
    return InvitationPublicResponse(
        email=invite.email,
        role=invite.role,
        invited_by=inviter_name,
        expires_at=invite.expires_at,
        status=invite.status,
    )
