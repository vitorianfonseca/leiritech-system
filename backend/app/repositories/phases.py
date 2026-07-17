"""Phase & milestone data-access layer (F10 / BR-050..052).

SQLAlchemy 2.0 (sync ``Session``) reads for phases and milestones plus the
"all tasks done" completion guard support (BR-051). Services call these; route
handlers never touch the ORM directly.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.project import Milestone, ProjectPhase
from app.models.task import Task


# --------------------------------------------------------------------------- #
# Phases
# --------------------------------------------------------------------------- #
def list_phases(db: Session, project_id: uuid.UUID) -> list[ProjectPhase]:
    return list(
        db.execute(
            select(ProjectPhase)
            .where(ProjectPhase.project_id == project_id)
            .order_by(ProjectPhase.order_index.asc(), ProjectPhase.created_at.asc())
        ).scalars()
    )


def phase_task_counts(db: Session, phase_id: uuid.UUID) -> tuple[int, int]:
    """``(total, done)`` counts of non-archived tasks in a phase (BR-051)."""
    total = int(
        db.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.phase_id == phase_id, Task.archived_at.is_(None))
        )
        or 0
    )
    done = int(
        db.scalar(
            select(func.count())
            .select_from(Task)
            .where(
                Task.phase_id == phase_id,
                Task.archived_at.is_(None),
                Task.status == "done",
            )
        )
        or 0
    )
    return total, done


def phase_progress(db: Session, phase_id: uuid.UUID) -> int:
    """Derived 0-100 completion percentage of a phase (BR-050)."""
    total, done = phase_task_counts(db, phase_id)
    if total == 0:
        return 0
    return round(done * 100 / total)


# --------------------------------------------------------------------------- #
# Milestones
# --------------------------------------------------------------------------- #
def list_milestones(db: Session, project_id: uuid.UUID) -> list[Milestone]:
    return list(
        db.execute(
            select(Milestone)
            .where(Milestone.project_id == project_id)
            .order_by(Milestone.due_date.asc().nulls_last(), Milestone.created_at.asc())
        ).scalars()
    )
