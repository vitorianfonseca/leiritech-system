"""Declarative base, naming conventions, and shared column mixins.

All tables carry a UUID primary key and ``created_at`` / ``updated_at``
timestamps. Most business tables also carry ``created_by`` (nullable FK to
``users``). Soft-deletable entities (companies, opportunities, projects, tasks,
proposals — BR-060) additionally carry ``archived_at``.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Deterministic constraint / index names so Alembic autogenerate is stable.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPKMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CreatedByMixin:
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


class ArchiveMixin:
    """Soft-delete marker (BR-060). ``None`` means the row is active."""

    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class AuditBase(UUIDPKMixin, TimestampMixin, CreatedByMixin, Base):
    """Common base for standard business tables."""

    __abstract__ = True
