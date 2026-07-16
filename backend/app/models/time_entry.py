"""Time tracking model.

BR-040 (issue #9): exactly one ACTIVE timer per user. Enforced at the DB level
by a PARTIAL UNIQUE INDEX on ``time_entries(user_id) WHERE ended_at IS NULL`` in
addition to service-layer checks.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import AuditBase


class TimeEntry(AuditBase):
    __tablename__ = "time_entries"
    __table_args__ = (
        # BR-040 — at most one running timer (ended_at IS NULL) per user.
        Index(
            "uq_time_entries_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
        Index("ix_time_entries_user_started", "user_id", "started_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # NULL ended_at => timer is currently running (BR-040).
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
