"""Auth routes: login, logout, refresh, password reset/change, and profile."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.core import errors
from app.core.config import settings
from app.core.rate_limit import SlidingWindowRateLimiter
from app.database.session import get_db
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
)
from app.services import auth_service

router = APIRouter()

# Two process-local login limiters (see rate_limit.py for the multi-instance
# caveat). Per-(ip,email) blunts targeted brute force of one account; per-ip
# blunts credential stuffing / password spraying where an attacker VARIES the
# email each attempt (which would bypass a per-account-only limiter). The IP
# budget is a multiple of the account budget to tolerate a few users behind a
# shared NAT while still bounding total attempts from one source.
login_rate_limiter = SlidingWindowRateLimiter(settings.LOGIN_RATE_LIMIT_PER_MINUTE)
login_ip_rate_limiter = SlidingWindowRateLimiter(
    max(settings.LOGIN_RATE_LIMIT_PER_MINUTE * 4, 20)
)

# audit H1: /password/forgot triggers an outbound email per hit — throttle
# per-(ip,email) AND per-ip so an attacker can't mail-bomb one address from many
# emails-per-request, nor spray many addresses from one IP.
forgot_password_rate_limiter = SlidingWindowRateLimiter(
    settings.PASSWORD_FORGOT_RATE_LIMIT_PER_MINUTE
)
forgot_password_ip_rate_limiter = SlidingWindowRateLimiter(
    max(settings.PASSWORD_FORGOT_RATE_LIMIT_PER_MINUTE * 4, 20)
)
# /password/reset is public + tokenized — throttle per-ip against token guessing.
reset_password_rate_limiter = SlidingWindowRateLimiter(
    settings.PUBLIC_TOKEN_RATE_LIMIT_PER_MINUTE
)

DbSession = Annotated[Session, Depends(get_db)]


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse)
def login(request: Request, payload: LoginRequest, db: DbSession) -> TokenResponse:
    # Per-IP budget first (credential stuffing / spraying), then per-account.
    ip = _client_ip(request)
    if not login_ip_rate_limiter.check(ip):
        raise errors.too_many_requests()
    if not login_rate_limiter.check(f"{ip}:{payload.email.lower()}"):
        raise errors.too_many_requests()

    user = auth_service.authenticate(db, payload.email, payload.password)
    access, refresh = auth_service.issue_tokens(
        db,
        user,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.ACCESS_TOKEN_TTL,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, payload: RefreshRequest, db: DbSession) -> TokenResponse:
    access, new_refresh = auth_service.rotate_refresh(
        db,
        payload.refresh_token,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    return TokenResponse(
        access_token=access,
        refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_TTL,
    )


@router.post("/logout", response_model=MessageResponse)
def logout(payload: LogoutRequest, db: DbSession) -> MessageResponse:
    auth_service.revoke_session(db, payload.refresh_token)
    return MessageResponse(message="Sessão terminada.")


@router.post("/password/forgot", response_model=MessageResponse)
def forgot_password(
    request: Request, payload: ForgotPasswordRequest, db: DbSession
) -> MessageResponse:
    from app.services.email_service import email_service

    ip = _client_ip(request)
    if not forgot_password_ip_rate_limiter.check(ip):
        raise errors.too_many_requests()
    if not forgot_password_rate_limiter.check(f"{ip}:{payload.email.lower()}"):
        raise errors.too_many_requests()

    link = auth_service.request_password_reset(db, payload.email)
    if link is not None:
        email_service.send_password_reset(to=payload.email, reset_link=link)
    # Always 200 — never reveal whether the email exists (§9).
    return MessageResponse(
        message="Se existir uma conta com este email, enviámos as instruções."
    )


@router.post("/password/reset", response_model=MessageResponse)
def reset_password(
    request: Request, payload: ResetPasswordRequest, db: DbSession
) -> MessageResponse:
    if not reset_password_rate_limiter.check(_client_ip(request)):
        raise errors.too_many_requests()
    auth_service.reset_password(db, payload.token, payload.new_password)
    return MessageResponse(message="Palavra-passe redefinida com sucesso.")


@router.get("/me", response_model=UserResponse)
def read_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
def update_me(
    payload: UpdateProfileRequest, current_user: CurrentUser
) -> UserResponse:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise errors.bad_request("Nada para atualizar.", code="NO_FIELDS")
    for field, value in data.items():
        setattr(current_user, field, value)
    return UserResponse.model_validate(current_user)


@router.post("/me/password", response_model=MessageResponse)
def change_my_password(
    payload: ChangePasswordRequest, current_user: CurrentUser, db: DbSession
) -> MessageResponse:
    auth_service.change_password(
        db, current_user, payload.current_password, payload.new_password
    )
    return MessageResponse(message="Palavra-passe alterada com sucesso.")
