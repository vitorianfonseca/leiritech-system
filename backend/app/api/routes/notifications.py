"""Notification center routes (F15).

Every endpoint here is strictly OWN-scoped: a user reads and mutates only their
own notifications (BR-002). Scoping is decided backend-side in
``notification_service`` — the caller's identity comes from the access token,
never from a client-supplied user id. Handlers stay thin: authenticate,
delegate, serialize.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.notifications import (
    MarkAllReadResponse,
    NotificationResponse,
    UnreadCountResponse,
)
from app.services import notification_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[NotificationResponse])
def list_notifications(
    user: CurrentUser,
    db: DbSession,
    unread_only: Annotated[bool, Query()] = False,
    include_archived: Annotated[bool, Query()] = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[NotificationResponse]:
    """The caller's own notifications, newest first."""
    items, total = notification_service.list_notifications(
        db,
        user,
        unread_only=unread_only,
        include_archived=include_archived,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(user: CurrentUser, db: DbSession) -> UnreadCountResponse:
    """Badge count of the caller's unread, non-archived notifications."""
    return UnreadCountResponse(unread=notification_service.unread_count(db, user))


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> NotificationResponse:
    """Mark one of the caller's notifications read (404 if not theirs)."""
    notification = notification_service.mark_read(db, user, notification_id)
    return NotificationResponse.model_validate(notification)


@router.post("/read-all", response_model=MarkAllReadResponse)
def mark_all_read(user: CurrentUser, db: DbSession) -> MarkAllReadResponse:
    """Mark all of the caller's unread notifications read."""
    return MarkAllReadResponse(marked=notification_service.mark_all_read(db, user))
