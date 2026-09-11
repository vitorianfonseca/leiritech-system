"""User, session, preference, and invitation models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import AuditBase, Base, TimestampMixin, UUIDPKMixin
from app.models import enums


class User(AuditBase):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum(*enums.USER_ROLES, name="user_role", native_enum=False),
        nullable=False,
        default="membro",
    )
    status: Mapped[str] = mapped_column(
        Enum(*enums.USER_STATUSES, name="user_status", native_enum=False),
        nullable=False,
        default="active",
    )
    # Explicit per-user capability grants for Gestor (BR-003). NOT a custom perms system.
    payments_grant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    invites_grant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Capacity planning (BR-080..084).
    weekly_capacity_hours: Mapped[float] = mapped_column(
        Numeric(5, 2), nullable=False, default=40
    )
    # Internal cost rate for margin math, stored in integer cents/EUR per hour.
    internal_cost_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    availability_override: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class RoleCapacityConfig(AuditBase):
    """Admin-configurable per-role capacity targets (BR-080/081, audit H16).

    Previously the utilization target was configurable only via the
    ``WORKLOAD_TARGET_*`` env vars — not runtime-editable by an Admin as the
    permission matrix requires. One row per role; ``workload_service`` reads
    from here first and falls back to the env-var defaults when a role has no
    row yet, so the feature works out of the box before any Admin edits it.
    """

    __tablename__ = "role_capacity_configs"

    role: Mapped[str] = mapped_column(
        Enum(*enums.USER_ROLES, name="capacity_config_role", native_enum=False),
        nullable=False,
        unique=True,
    )
    weekly_capacity_hours: Mapped[float] = mapped_column(
        Numeric(5, 2), nullable=False, default=40
    )
    # Fraction 0..1 (BR-081) — never a flat cross-role %.
    utilization_target: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    # EUR cents/hour (BR-069) — Admin-only, never Membro-visible.
    internal_cost_rate_cents: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )


class UserSession(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "user_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserPreference(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    locale: Mapped[str] = mapped_column(String(10), nullable=False, default="pt-PT")
    theme: Mapped[str] = mapped_column(String(16), nullable=False, default="light")
    notification_channels: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )


class Invitation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "invitations"

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    role: Mapped[str] = mapped_column(
        Enum(*enums.USER_ROLES, name="invitation_role", native_enum=False),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(
        Enum(*enums.INVITATION_STATUSES, name="invitation_status", native_enum=False),
        nullable=False,
        default="pending",
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
