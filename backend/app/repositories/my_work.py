"""Aggregate data-access for the My Work daily hub (F3/F17).

Read-only queries assembling the authenticated caller's personal overview:
assigned tasks, upcoming meetings, @mentions, a review queue (Gestor+/Admin),
project cards and recent time entries. Everything is scoped to the caller
(BR-002 — own work only); the ORM is never touched from a route handler.

Archived rows are excluded. Money/duration are integers.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models.collaboration import Comment, Mention
from app.models.crm import Company, Meeting, Opportunity
from app.models.project import Project, ProjectMember, ProjectPhase
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User

_PROJECT_OPEN = ("planning", "active", "on_hold")


def _scoped_project_ids(user_id: uuid.UUID) -> Select:
    return select(Project.id).where(
        or_(
            Project.manager_id == user_id,
            Project.id.in_(
                select(ProjectMember.project_id).where(
                    ProjectMember.user_id == user_id
                )
            ),
        )
    )


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
def assigned_open_tasks(
    db: Session, user_id: uuid.UUID
) -> list[tuple[Task, str | None]]:
    """The caller's assigned, non-archived, not-done tasks (+ project name)."""
    stmt = (
        select(Task, Project.name)
        .join(Project, Project.id == Task.project_id)
        .where(
            Task.archived_at.is_(None),
            Task.primary_assignee_id == user_id,
            Task.status != "done",
        )
    )
    return [(row[0], row[1]) for row in db.execute(stmt).all()]


def comment_counts(
    db: Session, task_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    if not task_ids:
        return {}
    rows = db.execute(
        select(Comment.entity_id, func.count())
        .where(Comment.entity_type == "task", Comment.entity_id.in_(task_ids))
        .group_by(Comment.entity_id)
    ).all()
    return {row[0]: int(row[1]) for row in rows}


# --------------------------------------------------------------------------- #
# Review queue (Gestor+/Admin — C3)
# --------------------------------------------------------------------------- #
def review_tasks(
    db: Session, *, scope_project_ids: Select | None, limit: int = 20
) -> list[tuple[Task, str | None, str | None]]:
    """Tasks awaiting review (+ project name, assignee name).

    ``scope_project_ids`` restricts a Gestor to their own projects; pass ``None``
    for the whole operation (Admin).
    """
    assignee = User.__table__.alias("assignee")
    stmt = (
        select(Task, Project.name, assignee.c.name)
        .join(Project, Project.id == Task.project_id)
        .outerjoin(assignee, assignee.c.id == Task.primary_assignee_id)
        .where(Task.archived_at.is_(None), Task.status == "in_review")
        .order_by(Task.updated_at.desc())
        .limit(limit)
    )
    if scope_project_ids is not None:
        stmt = stmt.where(Task.project_id.in_(scope_project_ids))
    return [(row[0], row[1], row[2]) for row in db.execute(stmt).all()]


# --------------------------------------------------------------------------- #
# Meetings
# --------------------------------------------------------------------------- #
def upcoming_meetings(
    db: Session, user_id: uuid.UUID, today: date, limit: int = 10
) -> list[Meeting]:
    day = func.date(Meeting.start_at)
    stmt = (
        select(Meeting)
        .where(
            Meeting.status != "cancelled",
            day >= today,
            or_(
                Meeting.organizer_id == user_id,
                Meeting.project_id.in_(_scoped_project_ids(user_id)),
            ),
        )
        .order_by(Meeting.start_at)
        .limit(limit)
    )
    return list(db.scalars(stmt))


# --------------------------------------------------------------------------- #
# Mentions
# --------------------------------------------------------------------------- #
def recent_mentions(
    db: Session, user_id: uuid.UUID, limit: int = 10
) -> list[tuple[Mention, Comment, str | None]]:
    """The caller's most recent @mentions (+ comment, author name)."""
    stmt = (
        select(Mention, Comment, User.name)
        .join(Comment, Comment.id == Mention.comment_id)
        .outerjoin(User, User.id == Comment.author_id)
        .where(Mention.mentioned_user_id == user_id)
        .order_by(Comment.created_at.desc())
        .limit(limit)
    )
    return [(row[0], row[1], row[2]) for row in db.execute(stmt).all()]


def entity_labels(
    db: Session, entity_type: str, entity_ids: list[uuid.UUID]
) -> dict[uuid.UUID, str]:
    """Resolve display labels for polymorphic mention targets."""
    if not entity_ids:
        return {}
    model_col = {
        "task": (Task.id, Task.title),
        "project": (Project.id, Project.name),
        "opportunity": (Opportunity.id, Opportunity.title),
        "company": (Company.id, Company.name),
    }.get(entity_type)
    if model_col is None:
        return {}
    id_col, label_col = model_col
    rows = db.execute(
        select(id_col, label_col).where(id_col.in_(entity_ids))
    ).all()
    return {row[0]: row[1] for row in rows}


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
def my_projects(db: Session, user_id: uuid.UUID) -> list[tuple[Project, str | None]]:
    """Open projects the caller manages or is a member of (+ client name)."""
    stmt = (
        select(Project, Company.name)
        .outerjoin(Company, Company.id == Project.company_id)
        .where(
            Project.archived_at.is_(None),
            Project.status.in_(_PROJECT_OPEN),
            Project.id.in_(_scoped_project_ids(user_id)),
        )
        .order_by(Project.name)
    )
    return [(row[0], row[1]) for row in db.execute(stmt).all()]


def open_task_counts(
    db: Session, project_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    if not project_ids:
        return {}
    rows = db.execute(
        select(Task.project_id, func.count())
        .where(
            Task.archived_at.is_(None),
            Task.status != "done",
            Task.project_id.in_(project_ids),
        )
        .group_by(Task.project_id)
    ).all()
    return {row[0]: int(row[1]) for row in rows}


def avg_phase_progress(
    db: Session, project_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    if not project_ids:
        return {}
    rows = db.execute(
        select(ProjectPhase.project_id, func.avg(ProjectPhase.progress))
        .where(ProjectPhase.project_id.in_(project_ids))
        .group_by(ProjectPhase.project_id)
    ).all()
    return {row[0]: int(round(float(row[1]))) for row in rows if row[1] is not None}


# --------------------------------------------------------------------------- #
# Time entries
# --------------------------------------------------------------------------- #
def recent_time_entries(
    db: Session, user_id: uuid.UUID, limit: int = 5
) -> list[tuple[TimeEntry, str | None, str | None]]:
    """The caller's most recent time entries (+ task title, project name)."""
    stmt = (
        select(TimeEntry, Task.title, Project.name)
        .join(Task, Task.id == TimeEntry.task_id)
        .join(Project, Project.id == Task.project_id)
        .where(TimeEntry.user_id == user_id, TimeEntry.ended_at.is_not(None))
        .order_by(TimeEntry.started_at.desc())
        .limit(limit)
    )
    return [(row[0], row[1], row[2]) for row in db.execute(stmt).all()]


def active_timer(
    db: Session, user_id: uuid.UUID
) -> tuple[TimeEntry, str | None, str | None] | None:
    """The caller's single running timer (+ task title, project name), if any."""
    row = db.execute(
        select(TimeEntry, Task.title, Project.name)
        .join(Task, Task.id == TimeEntry.task_id)
        .join(Project, Project.id == Task.project_id)
        .where(TimeEntry.user_id == user_id, TimeEntry.ended_at.is_(None))
    ).first()
    if row is None:
        return None
    return (row[0], row[1], row[2])
