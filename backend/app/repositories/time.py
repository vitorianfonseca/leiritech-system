"""Time-tracking data-access layer (F11).

SQLAlchemy 2.0 (sync ``Session``) reads/writes for ``time_entries``: the single
running entry per user (BR-040), ownership-scoped listing with task/project/date
filters, and single-row loads. Services call these; route handlers never touch
the ORM directly. The project-freeze cascade lives in ``projects`` repo's
``stop_running_timers`` — this module does not duplicate it.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ColumnElement, Select, and_, func, select
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.time_entry import TimeEntry


def get_active_entry(db: Session, user_id: uuid.UUID) -> TimeEntry | None:
    """The user's single running timer (``ended_at IS NULL``), if any (BR-040)."""
    return db.scalar(
        select(TimeEntry).where(
            TimeEntry.user_id == user_id,
            TimeEntry.ended_at.is_(None),
        )
    )


def get_entry(db: Session, entry_id: uuid.UUID) -> TimeEntry | None:
    return db.get(TimeEntry, entry_id)


def _paginate(
    db: Session, stmt: Select, *, page: int, page_size: int
) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars()
    )
    return rows, total


def list_entries(
    db: Session,
    *,
    user_id: uuid.UUID,
    task_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    started_from: datetime | None,
    started_to: datetime | None,
    page: int,
    page_size: int,
) -> tuple[list[TimeEntry], int]:
    stmt = select(TimeEntry)
    conditions: list[ColumnElement[bool]] = [TimeEntry.user_id == user_id]
    if task_id is not None:
        conditions.append(TimeEntry.task_id == task_id)
    if project_id is not None:
        project_tasks = select(Task.id).where(Task.project_id == project_id)
        conditions.append(TimeEntry.task_id.in_(project_tasks))
    if started_from is not None:
        conditions.append(TimeEntry.started_at >= started_from)
    if started_to is not None:
        conditions.append(TimeEntry.started_at <= started_to)
    stmt = stmt.where(and_(*conditions)).order_by(TimeEntry.started_at.desc())
    return _paginate(db, stmt, page=page, page_size=page_size)
