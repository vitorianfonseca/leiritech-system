"""Notification data-access layer (F15).

SQLAlchemy 2.0 (sync ``Session``) reads/writes backing the notification center
and the automation/event producers. Horizontal scoping (a user only sees their
own notifications, BR-002) is applied here by always filtering on ``user_id`` —
the service passes the authenticated caller's id and never trusts one from the
client.

Recipient-resolution helpers (``admin_ids``/``finance_recipient_ids``) back the
role-targeted automations (AUTO-02/AUTO-08 to Admin + Gestor-with-grant).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.permissions import Role
from app.models.collaboration import Notification
from app.models.user import User


def list_for_user(
    db: Session,
    user_id: uuid.UUID,
    *,
    unread_only: bool,
    include_archived: bool,
    page: int,
    page_size: int,
) -> tuple[list[Notification], int]:
    """Owner-scoped, newest-first page of notifications with its total count."""
    filters = [Notification.user_id == user_id]
    if unread_only:
        filters.append(Notification.read_at.is_(None))
    if not include_archived:
        filters.append(Notification.archived_at.is_(None))

    total = int(
        db.scalar(select(func.count()).select_from(Notification).where(*filters)) or 0
    )
    items = list(
        db.execute(
            select(Notification)
            .where(*filters)
            .order_by(Notification.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).scalars()
    )
    return items, total


def get_for_user(
    db: Session, user_id: uuid.UUID, notification_id: uuid.UUID
) -> Notification | None:
    """Load a single notification only if it belongs to ``user_id`` (else None)."""
    return db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )


def unread_count(db: Session, user_id: uuid.UUID) -> int:
    """Count of the caller's unread, non-archived notifications (badge value)."""
    return int(
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
                Notification.archived_at.is_(None),
            )
        )
        or 0
    )


def mark_all_read(db: Session, user_id: uuid.UUID, *, now: datetime | None = None) -> int:
    """Mark every unread, non-archived notification of the user read. Returns the
    number of rows updated. Idempotent — a second call updates nothing."""
    stamp = now or datetime.now(tz=UTC)
    result = db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
            Notification.archived_at.is_(None),
        )
        .values(read_at=stamp)
    )
    return int(result.rowcount or 0)


def exists_with_group_key(db: Session, user_id: uuid.UUID, group_key: str) -> bool:
    """True if the user already has a notification with this ``group_key``.

    The idempotency backbone of the daily automations: producers stamp a
    per-entity-per-day ``group_key`` so a re-run of the same job on the same day
    never creates a duplicate.
    """
    return (
        db.scalar(
            select(Notification.id).where(
                Notification.user_id == user_id,
                Notification.group_key == group_key,
            )
        )
        is not None
    )


def admin_ids(db: Session) -> list[uuid.UUID]:
    """Active Administrators — the always-on recipients of financial alerts."""
    return list(
        db.execute(
            select(User.id).where(User.role == Role.ADMIN, User.status == "active")
        ).scalars()
    )


def finance_recipient_ids(db: Session) -> list[uuid.UUID]:
    """BR-008 financial-alert audience: every active Admin plus every active
    Gestor holding the payments grant (AUTO-02/AUTO-08)."""
    return list(
        db.execute(
            select(User.id).where(
                User.status == "active",
                (User.role == Role.ADMIN)
                | ((User.role == Role.GESTOR) & (User.payments_grant.is_(True))),
            )
        ).scalars()
    )


def manager_recipient_ids(db: Session) -> list[uuid.UUID]:
    """Active Admins and Gestores — the management audience for workload
    warnings (AUTO-09: assigning Gestor + Admin)."""
    return list(
        db.execute(
            select(User.id).where(
                User.status == "active",
                User.role.in_((Role.ADMIN, Role.GESTOR)),
            )
        ).scalars()
    )
