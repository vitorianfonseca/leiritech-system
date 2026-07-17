"""Workload data-access layer (F13, BR-080..084).

SQLAlchemy 2.0 (sync ``Session``) reads backing the capacity computation:
active users, their assigned open-task load (Σ ``estimate_hours``), and their
billable logged hours for a window. Services call these; route handlers never
touch the ORM directly.

There is no Membro visibility filter here — horizontal scoping (BR-002) is
applied one layer up in ``workload_service`` (which restricts a Membro to their
own row before any team read runs).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User

# A task still consumes capacity until it is ``done``; archived (soft-deleted)
# tasks never count. ``estimate_hours`` is attributed to the PRIMARY assignee so
# a single task's estimate is counted exactly once (no double counting across
# secondary assignees).
_OPEN_TASK_STATUSES_EXCLUDED = ("done",)


def active_users(db: Session) -> list[User]:
    """All active users (status='active'), ordered by name for stable output."""
    return list(
        db.execute(
            select(User).where(User.status == "active").order_by(User.name.asc())
        ).scalars()
    )


def get_user(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def allocated_hours_by_user(db: Session) -> dict[uuid.UUID, float]:
    """Σ ``estimate_hours`` of each user's OPEN tasks, keyed by primary assignee.

    Open = not ``done`` and not archived, with a primary assignee and a
    non-null estimate. Returns only users who have some allocation.
    """
    rows = db.execute(
        select(
            Task.primary_assignee_id,
            func.coalesce(func.sum(Task.estimate_hours), 0),
        )
        .where(
            Task.primary_assignee_id.is_not(None),
            Task.archived_at.is_(None),
            Task.status.notin_(_OPEN_TASK_STATUSES_EXCLUDED),
            Task.estimate_hours.is_not(None),
        )
        .group_by(Task.primary_assignee_id)
    ).all()
    return {row[0]: float(row[1] or 0.0) for row in rows}


def allocated_hours_for_user(db: Session, user_id: uuid.UUID) -> float:
    """Σ ``estimate_hours`` of one user's OPEN assigned tasks."""
    total = db.scalar(
        select(func.coalesce(func.sum(Task.estimate_hours), 0)).where(
            Task.primary_assignee_id == user_id,
            Task.archived_at.is_(None),
            Task.status.notin_(_OPEN_TASK_STATUSES_EXCLUDED),
            Task.estimate_hours.is_not(None),
        )
    )
    return float(total or 0.0)


def billable_hours_by_user(db: Session, since: datetime) -> dict[uuid.UUID, float]:
    """Σ billable logged hours per user for entries started at/after ``since``.

    Only completed entries (``ended_at IS NOT NULL``) contribute a settled
    duration; a running timer has no elapsed hours yet (BR-083).
    """
    rows = db.execute(
        select(
            TimeEntry.user_id,
            func.coalesce(
                func.sum(
                    func.extract("epoch", TimeEntry.ended_at - TimeEntry.started_at)
                ),
                0,
            ),
        )
        .where(
            TimeEntry.billable.is_(True),
            TimeEntry.ended_at.is_not(None),
            TimeEntry.started_at >= since,
        )
        .group_by(TimeEntry.user_id)
    ).all()
    return {row[0]: float(row[1] or 0.0) / 3600.0 for row in rows}


def billable_hours_for_user(
    db: Session, user_id: uuid.UUID, since: datetime
) -> float:
    """Σ billable logged hours for one user since ``since`` (decimal hours)."""
    seconds = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    func.extract("epoch", TimeEntry.ended_at - TimeEntry.started_at)
                ),
                0,
            )
        ).where(
            TimeEntry.user_id == user_id,
            TimeEntry.billable.is_(True),
            TimeEntry.ended_at.is_not(None),
            TimeEntry.started_at >= since,
        )
    )
    return float(seconds or 0.0) / 3600.0
