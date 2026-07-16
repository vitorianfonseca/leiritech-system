"""Project models: projects, members, phases, milestones, and templates.

Money fields are integer EUR cents.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import (
    BigInteger,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import ArchiveMixin, AuditBase
from app.models import enums


class Project(AuditBase, ArchiveMixin):
    __tablename__ = "projects"
    __table_args__ = (
        Index(
            "ix_projects_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index("ix_projects_status_manager", "status", "manager_id"),
    )

    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
    opportunity_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="SET NULL")
    )
    accepted_proposal_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("proposals.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    contracted_value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # EUR cents
    hours_budget: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    internal_cost_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)  # cents/hour
    status: Mapped[str] = mapped_column(
        Enum(*enums.PROJECT_STATUSES, name="project_status", native_enum=False),
        nullable=False,
        default="planning",
    )
    suggested_health: Mapped[str | None] = mapped_column(
        Enum(*enums.PROJECT_HEALTH, name="project_suggested_health", native_enum=False),
        nullable=True,
    )
    published_health: Mapped[str | None] = mapped_column(
        Enum(*enums.PROJECT_HEALTH, name="project_published_health", native_enum=False),
        nullable=True,
    )


class ProjectMember(AuditBase):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    role_in_project: Mapped[str | None] = mapped_column(String(128), nullable=True)


class ProjectPhase(AuditBase):
    __tablename__ = "project_phases"

    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 0-100, derived
    # use_alter breaks the circular FK with milestones (milestones.phase_id ->
    # project_phases); the constraint is added via ALTER after both tables exist.
    final_milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey(
            "milestones.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_project_phases_final_milestone_id_milestones",
        ),
    )
    status: Mapped[str] = mapped_column(
        Enum(*enums.PHASE_STATUSES, name="phase_status", native_enum=False),
        nullable=False,
        default="not_started",
    )


class Milestone(AuditBase):
    __tablename__ = "milestones"

    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    phase_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("project_phases.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(
        Enum(*enums.MILESTONE_STATUSES, name="milestone_status", native_enum=False),
        nullable=False,
        default="pending",
    )


class ProjectTemplate(AuditBase):
    __tablename__ = "project_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)  # days


class TemplatePhase(AuditBase):
    __tablename__ = "template_phases"

    template_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("project_templates.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)  # days


class TemplateTask(AuditBase):
    __tablename__ = "template_tasks"

    template_phase_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("template_phases.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role_responsible: Mapped[str | None] = mapped_column(String(128), nullable=True)
    estimate_hours: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
