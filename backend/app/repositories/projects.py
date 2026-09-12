"""Project data-access layer (F8/F9).

SQLAlchemy 2.0 (sync ``Session``) query building for projects, members, health,
the cascade-freeze helpers (BR-053) and template loading (F9). Services call
these; route handlers never touch the ORM directly. The Membro visibility
boundary (BR-002) restricts projects to those a user manages or is a member of.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.finance import PaymentMilestone
from app.models.project import (
    Project,
    ProjectMember,
    ProjectPhase,
    ProjectTemplate,
    TemplatePhase,
    TemplateTask,
)
from app.models.task import Task
from app.models.user import User
from app.models.time_entry import TimeEntry


# --------------------------------------------------------------------------- #
# Membro visibility (BR-002)
# --------------------------------------------------------------------------- #
def membro_project_filter(user_id: uuid.UUID) -> ColumnElement[bool]:
    """WHERE predicate restricting projects to those a Membro may see (BR-002):
    ones they manage (owner) or are an assigned member of."""
    return or_(
        Project.manager_id == user_id,
        Project.id.in_(
            select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
        ),
    )


def is_member(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return bool(
        db.scalar(
            select(func.count())
            .select_from(ProjectMember)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
        )
    )


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #
def _paginate(
    db: Session, stmt: Select, *, page: int, page_size: int
) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars()
    )
    return rows, total


def _sort(sort: str):
    mapping = {
        "name": Project.name.asc(),
        "-name": Project.name.desc(),
        "created_at": Project.created_at.asc(),
        "-created_at": Project.created_at.desc(),
        "deadline": Project.deadline.asc(),
        "-deadline": Project.deadline.desc(),
    }
    return mapping.get(sort, Project.created_at.desc())


def list_projects(
    db: Session,
    *,
    scope_filter: ColumnElement[bool] | None,
    company_id: uuid.UUID | None,
    manager_id: uuid.UUID | None,
    status: str | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Project], int]:
    stmt = select(Project)
    conditions: list[ColumnElement[bool]] = []
    if scope_filter is not None:
        conditions.append(scope_filter)
    if not include_archived:
        conditions.append(Project.archived_at.is_(None))
    if company_id is not None:
        conditions.append(Project.company_id == company_id)
    if manager_id is not None:
        conditions.append(Project.manager_id == manager_id)
    if status is not None:
        conditions.append(Project.status == status)
    if q:
        conditions.append(Project.name.ilike(f"%{q}%"))
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(_sort(sort))
    return _paginate(db, stmt, page=page, page_size=page_size)


# --------------------------------------------------------------------------- #
# Members
# --------------------------------------------------------------------------- #
def list_members(db: Session, project_id: uuid.UUID) -> list[ProjectMember]:
    return list(
        db.execute(
            select(ProjectMember)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.created_at.asc())
        ).scalars()
    )


def names_for(db: Session, user_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Map user ids to display names in one query."""
    ids = {i for i in user_ids if i is not None}
    if not ids:
        return {}
    rows = db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()
    return {row[0]: row[1] for row in rows}


def project_names_for(db: Session, project_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Map project ids to names in one query."""
    ids = {i for i in project_ids if i is not None}
    if not ids:
        return {}
    rows = db.execute(select(Project.id, Project.name).where(Project.id.in_(ids))).all()
    return {row[0]: row[1] for row in rows}


def phase_names_for(db: Session, phase_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Map phase ids to names in one query."""
    ids = {i for i in phase_ids if i is not None}
    if not ids:
        return {}
    rows = db.execute(
        select(ProjectPhase.id, ProjectPhase.name).where(ProjectPhase.id.in_(ids))
    ).all()
    return {row[0]: row[1] for row in rows}


def get_member(
    db: Session, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectMember | None:
    return db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )


def member_count(db: Session, project_id: uuid.UUID) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(ProjectMember)
            .where(ProjectMember.project_id == project_id)
        )
        or 0
    )


# --------------------------------------------------------------------------- #
# Lifecycle guards (§1.3 / BR-037 / BR-051)
# --------------------------------------------------------------------------- #
def phase_count(db: Session, project_id: uuid.UUID) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(ProjectPhase)
            .where(ProjectPhase.project_id == project_id)
        )
        or 0
    )


def unconfirmed_payment_milestone_count(db: Session, project_id: uuid.UUID) -> int:
    """Payment milestones on the project still awaiting human confirmation
    (BR-037/H5): ``confirmer_id IS NULL`` and not cancelled."""
    return int(
        db.scalar(
            select(func.count())
            .select_from(PaymentMilestone)
            .where(
                PaymentMilestone.project_id == project_id,
                PaymentMilestone.confirmer_id.is_(None),
                PaymentMilestone.status != "cancelled",
            )
        )
        or 0
    )


def incomplete_phase_count(db: Session, project_id: uuid.UUID) -> int:
    """Non-archived phases that are not yet ``completed`` (BR-051 — a project
    completes only when all its phases are done). Phases have no archive flag, so
    every phase counts."""
    return int(
        db.scalar(
            select(func.count())
            .select_from(ProjectPhase)
            .where(
                ProjectPhase.project_id == project_id,
                ProjectPhase.status != "completed",
            )
        )
        or 0
    )


def running_timer_count(db: Session, project_id: uuid.UUID) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(TimeEntry)
            .join(Task, Task.id == TimeEntry.task_id)
            .where(Task.project_id == project_id, TimeEntry.ended_at.is_(None))
        )
        or 0
    )


def stop_running_timers(db: Session, project_id: uuid.UUID) -> int:
    """Cascade: stop every running timer on the project's tasks (BR-042/BR-053).

    Returns the number of timers stopped. Written at the data layer (not through
    the time domain's service) so the project cascade owns exactly one concern:
    ending open ``time_entries`` for the project. Does NOT commit — the caller
    owns the transaction.
    """
    now = datetime.now(tz=UTC)
    open_entries = list(
        db.execute(
            select(TimeEntry)
            .join(Task, Task.id == TimeEntry.task_id)
            .where(Task.project_id == project_id, TimeEntry.ended_at.is_(None))
        ).scalars()
    )
    for entry in open_entries:
        entry.ended_at = now
    if open_entries:
        db.flush()
    return len(open_entries)


# --------------------------------------------------------------------------- #
# Templates (F9)
# --------------------------------------------------------------------------- #
def list_templates(db: Session) -> list[ProjectTemplate]:
    return list(
        db.execute(
            select(ProjectTemplate).order_by(ProjectTemplate.name.asc())
        ).scalars()
    )


def template_phases(db: Session, template_id: uuid.UUID) -> list[TemplatePhase]:
    return list(
        db.execute(
            select(TemplatePhase)
            .where(TemplatePhase.template_id == template_id)
            .order_by(TemplatePhase.order_index.asc())
        ).scalars()
    )


def template_tasks(db: Session, template_phase_id: uuid.UUID) -> list[TemplateTask]:
    return list(
        db.execute(
            select(TemplateTask)
            .where(TemplateTask.template_phase_id == template_phase_id)
            .order_by(TemplateTask.order_index.asc())
        ).scalars()
    )
