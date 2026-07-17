"""Task data-access layer (F10).

SQLAlchemy 2.0 (sync ``Session``) query building for tasks, the Membro
visibility boundary (BR-002), dependency graph reads (BR-045/047) and the
phase-completion guard support (BR-051). Services call these; route handlers
never touch the ORM directly.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectMember
from app.models.task import Task, TaskAssignee, TaskDependency


# --------------------------------------------------------------------------- #
# Membro visibility (BR-002)
# --------------------------------------------------------------------------- #
def membro_task_filter(user_id: uuid.UUID) -> ColumnElement[bool]:
    """WHERE predicate restricting tasks to those a Membro may see (BR-002): the
    task is assigned to them (primary or collaborator) OR it lives in a project
    they manage or are a member of."""
    member_projects = select(ProjectMember.project_id).where(
        ProjectMember.user_id == user_id
    )
    owned_projects = select(Project.id).where(Project.manager_id == user_id)
    collaborator_tasks = select(TaskAssignee.task_id).where(
        TaskAssignee.user_id == user_id
    )
    return or_(
        Task.primary_assignee_id == user_id,
        Task.id.in_(collaborator_tasks),
        Task.project_id.in_(member_projects),
        Task.project_id.in_(owned_projects),
    )


def is_assignee(db: Session, task_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    """True when the user is a collaborator assignee of the task."""
    return bool(
        db.scalar(
            select(func.count())
            .select_from(TaskAssignee)
            .where(
                TaskAssignee.task_id == task_id,
                TaskAssignee.user_id == user_id,
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
        "created_at": Task.created_at.asc(),
        "-created_at": Task.created_at.desc(),
        "due_date": Task.due_date.asc(),
        "-due_date": Task.due_date.desc(),
        "title": Task.title.asc(),
        "-title": Task.title.desc(),
    }
    return mapping.get(sort, Task.created_at.desc())


def list_tasks(
    db: Session,
    *,
    scope_filter: ColumnElement[bool] | None,
    project_id: uuid.UUID | None,
    phase_id: uuid.UUID | None,
    assignee_id: uuid.UUID | None,
    status: str | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Task], int]:
    stmt = select(Task)
    conditions: list[ColumnElement[bool]] = []
    if scope_filter is not None:
        conditions.append(scope_filter)
    if not include_archived:
        conditions.append(Task.archived_at.is_(None))
    if project_id is not None:
        conditions.append(Task.project_id == project_id)
    if phase_id is not None:
        conditions.append(Task.phase_id == phase_id)
    if assignee_id is not None:
        conditions.append(Task.primary_assignee_id == assignee_id)
    if status is not None:
        conditions.append(Task.status == status)
    if q:
        conditions.append(Task.title.ilike(f"%{q}%"))
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(_sort(sort))
    return _paginate(db, stmt, page=page, page_size=page_size)


# --------------------------------------------------------------------------- #
# Dependencies (BR-045 gating / BR-047 cycle detection)
# --------------------------------------------------------------------------- #
def list_dependencies(db: Session, task_id: uuid.UUID) -> list[TaskDependency]:
    return list(
        db.execute(
            select(TaskDependency)
            .where(TaskDependency.task_id == task_id)
            .order_by(TaskDependency.created_at.asc())
        ).scalars()
    )


def get_dependency(
    db: Session, task_id: uuid.UUID, depends_on_task_id: uuid.UUID
) -> TaskDependency | None:
    return db.scalar(
        select(TaskDependency).where(
            TaskDependency.task_id == task_id,
            TaskDependency.depends_on_task_id == depends_on_task_id,
        )
    )


def project_dependency_edges(
    db: Session, project_id: uuid.UUID
) -> list[tuple[uuid.UUID, uuid.UUID]]:
    """Every ``(task_id, depends_on_task_id)`` edge within a project, used to
    detect cycles before inserting a new edge (BR-047)."""
    rows = db.execute(
        select(TaskDependency.task_id, TaskDependency.depends_on_task_id)
        .join(Task, Task.id == TaskDependency.task_id)
        .where(Task.project_id == project_id)
    ).all()
    return [(r[0], r[1]) for r in rows]


def unmet_dependency_ids(db: Session, task_id: uuid.UUID) -> list[uuid.UUID]:
    """IDs of the task's blocking dependencies that are not yet satisfied
    (BR-045): a blocking task counts as unmet while it is non-archived and not
    ``done``. Archived blockers are treated as removed (met)."""
    blocker = Task.__table__.alias("blocker")
    rows = db.execute(
        select(TaskDependency.depends_on_task_id)
        .join(blocker, blocker.c.id == TaskDependency.depends_on_task_id)
        .where(
            TaskDependency.task_id == task_id,
            blocker.c.archived_at.is_(None),
            blocker.c.status != "done",
        )
    ).all()
    return [r[0] for r in rows]
