"""Notification business logic (F15).

The ONE place notifications are created and read. Two audiences call in here:

* **Route handlers** — the notification center reads (``list``/``unread_count``)
  and the read-state mutations (``mark_read``/``mark_all_read``). Every read is
  owner-scoped (BR-002): the caller only ever sees or mutates their own rows; a
  request for someone else's notification is a 404 (enumeration-safe).
* **Producers** — the 12 automations and the event notifications call
  :func:`create_notification` / :func:`notify_many`. Both accept an optional
  ``group_key`` for daily idempotency: a producer stamps a per-entity-per-day
  key so re-running the same job on the same day never duplicates.

Producers never commit — the caller owns the transaction (the cron dispatcher
commits per job; event callers commit through the request's ``get_db``).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.models.collaboration import Notification
from app.models.user import User
from app.repositories import notifications as notification_repo

logger = structlog.get_logger("aurea.notification")


# --------------------------------------------------------------------------- #
# Producers (automations + event notifications)
# --------------------------------------------------------------------------- #
def create_notification(
    db: Session,
    *,
    user_id: uuid.UUID,
    type: str,
    body: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    group_key: str | None = None,
) -> Notification | None:
    """Create one notification for ``user_id``. Does NOT commit.

    When ``group_key`` is supplied and the user already holds a notification
    with that key, the create is skipped and ``None`` is returned — this is what
    makes the daily automations idempotent. Returns the new row otherwise.
    """
    if group_key is not None and notification_repo.exists_with_group_key(
        db, user_id, group_key
    ):
        return None

    notification = Notification(
        user_id=user_id,
        type=type,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        group_key=group_key,
    )
    db.add(notification)
    db.flush()
    logger.info(
        "notification_created",
        notification_id=str(notification.id),
        user_id=str(user_id),
        type=type,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
    )
    return notification


def notify_many(
    db: Session,
    *,
    user_ids: Iterable[uuid.UUID],
    type: str,
    body: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    group_key: str | None = None,
) -> int:
    """Fan a notification out to several recipients (deduped per user by
    ``group_key``). Returns the number actually created. Skips ``None`` ids and
    collapses duplicate recipients so no one is notified twice."""
    created = 0
    seen: set[uuid.UUID] = set()
    for user_id in user_ids:
        if user_id is None or user_id in seen:
            continue
        seen.add(user_id)
        if (
            create_notification(
                db,
                user_id=user_id,
                type=type,
                body=body,
                entity_type=entity_type,
                entity_id=entity_id,
                group_key=group_key,
            )
            is not None
        ):
            created += 1
    return created


# --------------------------------------------------------------------------- #
# Reads (notification center) — always owner-scoped (BR-002)
# --------------------------------------------------------------------------- #
def list_notifications(
    db: Session,
    user: User,
    *,
    unread_only: bool,
    include_archived: bool,
    page: int,
    page_size: int,
) -> tuple[list[Notification], int]:
    return notification_repo.list_for_user(
        db,
        user.id,
        unread_only=unread_only,
        include_archived=include_archived,
        page=page,
        page_size=page_size,
    )


def unread_count(db: Session, user: User) -> int:
    return notification_repo.unread_count(db, user.id)


# --------------------------------------------------------------------------- #
# Read-state mutations — a user can only touch their OWN notifications
# --------------------------------------------------------------------------- #
def mark_read(db: Session, user: User, notification_id: uuid.UUID) -> Notification:
    """Mark one of the caller's notifications read. A notification that does not
    belong to the caller yields 404 (enumeration-safe), so a user can never mark
    — or even confirm the existence of — someone else's notification."""
    notification = notification_repo.get_for_user(db, user.id, notification_id)
    if notification is None:
        raise errors.not_found(
            "Notificação não encontrada.", code="NOTIFICATION_NOT_FOUND"
        )
    if notification.read_at is None:
        notification.read_at = datetime.now(tz=UTC)
        db.flush()
        logger.info(
            "notification_read",
            notification_id=str(notification.id),
            user_id=str(user.id),
        )
    return notification


def mark_all_read(db: Session, user: User) -> int:
    marked = notification_repo.mark_all_read(db, user.id)
    logger.info("notifications_read_all", user_id=str(user.id), marked=marked)
    return marked


def archive(db: Session, user: User, notification_id: uuid.UUID) -> Notification:
    """Archive one of the caller's notifications (idempotent). A notification that
    does not belong to the caller yields 404 (enumeration-safe), exactly like
    ``mark_read`` — a user can only ever touch their own rows (BR-002)."""
    notification = notification_repo.get_for_user(db, user.id, notification_id)
    if notification is None:
        raise errors.not_found(
            "Notificação não encontrada.", code="NOTIFICATION_NOT_FOUND"
        )
    if notification.archived_at is None:
        notification.archived_at = datetime.now(tz=UTC)
        db.flush()
        logger.info(
            "notification_archived",
            notification_id=str(notification.id),
            user_id=str(user.id),
        )
    return notification


def unarchive(db: Session, user: User, notification_id: uuid.UUID) -> Notification:
    """Restore one of the caller's archived notifications (idempotent). Same
    own-scoped 404 guard as :func:`archive`."""
    notification = notification_repo.get_for_user(db, user.id, notification_id)
    if notification is None:
        raise errors.not_found(
            "Notificação não encontrada.", code="NOTIFICATION_NOT_FOUND"
        )
    if notification.archived_at is not None:
        notification.archived_at = None
        db.flush()
        logger.info(
            "notification_unarchived",
            notification_id=str(notification.id),
            user_id=str(user.id),
        )
    return notification
