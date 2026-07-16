"""Task models: tasks, assignees, checklist items, dependencies."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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


class Task(AuditBase, ArchiveMixin):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_project_status_due", "project_id", "status", "due_date"),
        Index(
            "ix_tasks_title_trgm",
            "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    phase_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("project_phases.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    priority: Mapped[str] = mapped_column(
        Enum(*enums.TASK_PRIORITIES, name="task_priority", native_enum=False),
        nullable=False,
        default="normal",
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    estimate_hours: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*enums.TASK_STATUSES, name="task_status", native_enum=False),
        nullable=False,
        default="todo",
    )
    block_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)


class TaskAssignee(AuditBase):
    __tablename__ = "task_assignees"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_assignee"),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )


class TaskChecklistItem(AuditBase):
    __tablename__ = "task_checklist_items"

    task_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    text: Mapped[str] = mapped_column(String(512), nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class TaskDependency(AuditBase):
    __tablename__ = "task_dependencies"
    __table_args__ = (
        UniqueConstraint("task_id", "depends_on_task_id", name="uq_task_dependency"),
        CheckConstraint("task_id <> depends_on_task_id", name="no_self_dependency"),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    depends_on_task_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False,
    )
