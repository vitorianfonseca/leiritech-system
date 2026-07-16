"""Collaboration & cross-cutting models: comments, mentions, attachments,
notifications, activity logs, tags, and entity tags.

Comments/attachments/notifications/activity_logs/entity_tags are polymorphic
via (``entity_type``, ``entity_id``) rather than hard FKs, so they attach to any
domain entity.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import AuditBase


class Comment(AuditBase):
    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_entity", "entity_type", "entity_id"),
    )

    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Mention(AuditBase):
    __tablename__ = "mentions"
    __table_args__ = (
        UniqueConstraint("comment_id", "mentioned_user_id", name="uq_mention"),
    )

    comment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    mentioned_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )


class Attachment(AuditBase):
    __tablename__ = "attachments"
    __table_args__ = (
        Index("ix_attachments_entity", "entity_type", "entity_id"),
    )

    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    r2_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class Notification(AuditBase):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "read_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    group_key: Mapped[str | None] = mapped_column(String(128), nullable=True)


class ActivityLog(AuditBase):
    """Append-only audit trail (BR-064)."""

    __tablename__ = "activity_logs"
    __table_args__ = (
        Index("ix_activity_logs_entity", "entity_type", "entity_id"),
    )

    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Tag(AuditBase):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("name", name="uq_tag_name"),
    )

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)


class EntityTag(AuditBase):
    __tablename__ = "entity_tags"
    __table_args__ = (
        UniqueConstraint("tag_id", "entity_type", "entity_id", name="uq_entity_tag"),
        Index("ix_entity_tags_entity", "entity_type", "entity_id"),
    )

    tag_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
