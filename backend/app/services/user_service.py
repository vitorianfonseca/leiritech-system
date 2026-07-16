"""User lifecycle service: activation, deactivation, and admin bootstrap.

Enforces BR-004/005/006/007 backend-side.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import errors, security
from app.core.permissions import Role
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.services import auth_service

logger = structlog.get_logger("aurea.users")


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _active_admin_count(db: Session) -> int:
    return db.execute(
        select(func.count())
        .select_from(User)
        .where(User.role == Role.ADMIN, User.status == "active")
    ).scalar_one()


def get_user_or_404(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise errors.not_found("Utilizador não encontrado.", code="USER_NOT_FOUND")
    return user


def _stop_running_timers(db: Session, user_id: uuid.UUID) -> int:
    """BR-006: stop any running timer for the user.

    Minimal safe stop — sets ``ended_at = now`` on the open entry. Duration
    rounding, billable finalization and the "timer stopped" notification are the
    responsibility of the time-tracking service (issue #19); this is the hook.
    """
    running = db.execute(
        select(TimeEntry).where(
            TimeEntry.user_id == user_id, TimeEntry.ended_at.is_(None)
        )
    ).scalars().all()
    for entry in running:
        entry.ended_at = _now()  # TODO(issue #19): route through time service for rounding
    return len(running)


def deactivate_user(db: Session, user_id: uuid.UUID) -> User:
    """Deactivate a user, enforcing the last-admin guard and BR-006 side effects."""
    user = get_user_or_404(db, user_id)

    if user.status == "deactivated":
        return user  # idempotent

    if user.role == Role.ADMIN and _active_admin_count(db) <= 1:
        raise errors.conflict(
            "Não é possível desativar o último Administrador ativo.",
            code="LAST_ADMIN",
        )

    user.status = "deactivated"
    revoked = auth_service.revoke_all_sessions(db, user.id)  # BR-006
    stopped = _stop_running_timers(db, user.id)  # BR-006
    logger.info(
        "user_deactivated",
        user_id=str(user.id),
        sessions_revoked=revoked,
        timers_stopped=stopped,
    )
    return user


def activate_user(db: Session, user_id: uuid.UUID) -> User:
    user = get_user_or_404(db, user_id)
    if user.status == "active":
        return user
    user.status = "active"
    logger.info("user_reactivated", user_id=str(user.id))
    return user


def create_admin(
    db: Session, *, name: str, email: str, password: str
) -> User:
    """Bootstrap the first Administrador (BR-007 — seed/CLI only, no signup)."""
    email = email.lower()
    existing = db.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()
    if existing is not None:
        raise errors.conflict(
            "Já existe um utilizador com este email.", code="EMAIL_TAKEN"
        )
    user = User(
        name=name,
        email=email,
        password_hash=security.hash_password(password),
        role=Role.ADMIN,
        status="active",
    )
    db.add(user)
    db.flush()
    logger.info("admin_created", user_id=str(user.id), email=email)
    return user
