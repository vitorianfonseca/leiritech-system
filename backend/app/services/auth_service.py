"""Authentication service: login, sessions, refresh rotation, password flows.

All authentication business logic lives here (never in route handlers). Login
errors are deliberately generic to prevent user enumeration (§9).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import errors, security
from app.core.config import settings
from app.models.user import User, UserSession

logger = structlog.get_logger("aurea.auth")

_GENERIC_LOGIN_ERROR = "Email ou palavra-passe incorretos."
_DEACTIVATED_ERROR = "Conta desativada. Contacte um Administrador."


def _now() -> datetime:
    return datetime.now(tz=UTC)


def authenticate(db: Session, email: str, password: str) -> User:
    """Return the user for valid credentials, else raise a generic 401.

    Runs the password hash verification even when the user does not exist so the
    response time does not leak account existence.
    """
    user = db.execute(
        select(User).where(User.email == email.lower())
    ).scalar_one_or_none()

    if user is None:
        # Constant-work path: verify against a throwaway hash to avoid a timing
        # oracle, then fail generically.
        security.verify_password(password, security.hash_password("timing-guard"))
        raise errors.unauthorized(_GENERIC_LOGIN_ERROR, code="INVALID_CREDENTIALS")

    if not security.verify_password(password, user.password_hash):
        raise errors.unauthorized(_GENERIC_LOGIN_ERROR, code="INVALID_CREDENTIALS")

    if user.status != "active":
        raise errors.unauthorized(_DEACTIVATED_ERROR, code="ACCOUNT_DEACTIVATED")

    # Transparent Argon2 upgrade if the stored hash uses outdated parameters.
    if security.needs_rehash(user.password_hash):
        user.password_hash = security.hash_password(password)

    user.last_login_at = _now()
    logger.info("login_success", user_id=str(user.id))
    return user


def issue_tokens(
    db: Session,
    user: User,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[str, str]:
    """Mint an access + refresh pair and persist the (hashed) refresh session."""
    access = security.create_access_token(str(user.id), {"role": user.role})
    refresh = security.create_refresh_token(str(user.id), {"jti": uuid.uuid4().hex})

    db.add(
        UserSession(
            user_id=user.id,
            refresh_token_hash=security.hash_token(refresh),
            user_agent=user_agent,
            ip_address=ip_address,
            expires_at=_now() + timedelta(seconds=settings.REFRESH_TOKEN_TTL),
        )
    )
    return access, refresh


def _active_session_for(db: Session, raw_refresh: str) -> UserSession | None:
    session = db.execute(
        select(UserSession).where(
            UserSession.refresh_token_hash == security.hash_token(raw_refresh)
        )
    ).scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        return None
    if session.expires_at <= _now():
        return None
    return session


def rotate_refresh(
    db: Session,
    raw_refresh: str,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[str, str]:
    """Validate a refresh token, revoke it, and issue a fresh pair (rotation).

    Rejects access tokens outright via ``decode_refresh_token`` (type check).
    """
    try:
        # Rejects access tokens (and any malformed/expired token) via type check.
        payload = security.decode_refresh_token(raw_refresh)
    except Exception as exc:  # noqa: BLE001
        raise errors.unauthorized(
            "Sessão inválida ou expirada.", code="INVALID_REFRESH_TOKEN"
        ) from exc

    session = _active_session_for(db, raw_refresh)
    if session is None or str(session.user_id) != payload.get("sub"):
        raise errors.unauthorized(
            "Sessão inválida ou expirada.", code="INVALID_REFRESH_TOKEN"
        )

    user = db.get(User, session.user_id)
    if user is None or user.status != "active":
        raise errors.unauthorized(_DEACTIVATED_ERROR, code="ACCOUNT_DEACTIVATED")

    session.revoked_at = _now()  # rotation: old token is single-use
    access, refresh = issue_tokens(
        db, user, user_agent=user_agent, ip_address=ip_address
    )
    logger.info("refresh_rotated", user_id=str(user.id))
    return access, refresh


def revoke_session(db: Session, raw_refresh: str) -> None:
    """Logout: revoke the presented refresh session. Idempotent (always 200)."""
    session = _active_session_for(db, raw_refresh)
    if session is not None:
        session.revoked_at = _now()
        logger.info("logout", user_id=str(session.user_id))


def revoke_all_sessions(db: Session, user_id: uuid.UUID) -> int:
    """Revoke every active session for a user (deactivation — BR-006)."""
    sessions = db.execute(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
    ).scalars().all()
    now = _now()
    for session in sessions:
        session.revoked_at = now
    return len(sessions)


def change_password(
    db: Session, user: User, current_password: str, new_password: str
) -> None:
    if not security.verify_password(current_password, user.password_hash):
        raise errors.bad_request(
            "A palavra-passe atual está incorreta.", code="INVALID_CURRENT_PASSWORD"
        )
    user.password_hash = security.hash_password(new_password)
    # Invalidate every existing session so a leaked token cannot outlive the change.
    revoke_all_sessions(db, user.id)
    logger.info("password_changed", user_id=str(user.id))


def request_password_reset(db: Session, email: str) -> str | None:
    """Issue a reset link for an active account. Returns the link only in dev;
    the caller always responds 200 regardless (no enumeration)."""
    user = db.execute(
        select(User).where(User.email == email.lower())
    ).scalar_one_or_none()
    if user is None or user.status != "active":
        logger.info("password_reset_requested_unknown", email=email)
        return None

    token = security.create_password_reset_token(
        str(user.id), security.password_fingerprint(user.password_hash)
    )
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    logger.info("password_reset_requested", user_id=str(user.id))
    return reset_link


def reset_password(db: Session, token: str, new_password: str) -> None:
    try:
        payload = security.decode_password_reset_token(token)
    except Exception as exc:  # noqa: BLE001
        raise errors.bad_request(
            "Ligação de redefinição inválida ou expirada.", code="INVALID_RESET_TOKEN"
        ) from exc

    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None or user.status != "active":
        raise errors.bad_request(
            "Ligação de redefinição inválida ou expirada.", code="INVALID_RESET_TOKEN"
        )
    # Single-use binding: the fingerprint must still match the current hash.
    if payload.get("pwf") != security.password_fingerprint(user.password_hash):
        raise errors.bad_request(
            "Ligação de redefinição inválida ou expirada.", code="INVALID_RESET_TOKEN"
        )

    user.password_hash = security.hash_password(new_password)
    revoke_all_sessions(db, user.id)
    logger.info("password_reset_completed", user_id=str(user.id))
