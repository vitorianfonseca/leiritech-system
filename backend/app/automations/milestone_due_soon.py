"""AUTO-06 — delivery milestone / phase due-soon flagging.

Daily. A delivery ``Milestone`` (still ``pending``) or a ``ProjectPhase`` (not
yet ``completed``) due within 3 days on a LIVE project (BR-054) notifies the
project's members and manager. Idempotent via a per-entity-per-day ``group_key``.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.automations._helpers import (
    LIVE_PROJECT_STATUSES,
    group_key,
    resolve_today,
)
from app.models.project import Milestone, Project, ProjectMember, ProjectPhase
from app.services import notification_service

logger = structlog.get_logger("leiritech.automation.milestone_due_soon")

CODE = "AUTO-06"
WINDOW_DAYS = 3


def _project_recipients(db: Session, project: Project) -> list:
    member_ids = list(
        db.execute(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == project.id
            )
        ).scalars()
    )
    return [project.manager_id, *member_ids]


def execute(db: Session, *, now: datetime | None = None) -> int:
    today = resolve_today(now)
    horizon = today + timedelta(days=WINDOW_DAYS)
    created = 0

    milestone_rows = db.execute(
        select(Milestone, Project)
        .join(Project, Milestone.project_id == Project.id)
        .where(
            Milestone.status == "pending",
            Milestone.due_date.is_not(None),
            Milestone.due_date >= today,
            Milestone.due_date <= horizon,
            Project.status.in_(LIVE_PROJECT_STATUSES),
        )
    ).all()
    for milestone, project in milestone_rows:
        days = (milestone.due_date - today).days
        created += notification_service.notify_many(
            db,
            user_ids=_project_recipients(db, project),
            type="milestone_due_soon",
            body=f"Marco «{milestone.name}» vence em {days} dia(s).",
            entity_type="milestone",
            entity_id=milestone.id,
            group_key=group_key(CODE, milestone.id, today),
        )

    phase_rows = db.execute(
        select(ProjectPhase, Project)
        .join(Project, ProjectPhase.project_id == Project.id)
        .where(
            ProjectPhase.status != "completed",
            ProjectPhase.deadline.is_not(None),
            ProjectPhase.deadline >= today,
            ProjectPhase.deadline <= horizon,
            Project.status.in_(LIVE_PROJECT_STATUSES),
        )
    ).all()
    for phase, project in phase_rows:
        days = (phase.deadline - today).days
        created += notification_service.notify_many(
            db,
            user_ids=_project_recipients(db, project),
            type="phase_due_soon",
            body=f"Fase «{phase.name}» vence em {days} dia(s).",
            entity_type="phase",
            entity_id=phase.id,
            group_key=group_key(CODE, phase.id, today),
        )

    logger.info(
        "auto06_milestone_due_soon",
        milestones=len(milestone_rows),
        phases=len(phase_rows),
        notified=created,
    )
    return created
