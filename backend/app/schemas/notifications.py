"""Notification schemas (F15).

Typed request/response models for the in-app notification center. Notifications
are strictly per-user: a user only ever reads and mutates their own rows, so
these carry no cross-user identifiers a client could use to enumerate others.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    """One notification as returned to its owner."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    entity_type: str | None
    entity_id: uuid.UUID | None
    body: str | None
    read_at: datetime | None
    archived_at: datetime | None
    group_key: str | None
    created_at: datetime


class UnreadCountResponse(BaseModel):
    """Badge count of the caller's unread, non-archived notifications."""

    unread: int


class MarkAllReadResponse(BaseModel):
    """Result of a bulk mark-all-read operation."""

    marked: int
