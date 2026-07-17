"""AUTO-07 — phase-completion suggestion, daily reconciliation sweep (BR-051).

The primary trigger for AUTO-07 is an EVENT: the task service calls
``phase_service.suggest_completion_if_ready`` when a task reaches ``done``. This
daily sweep is the safety net — it re-checks every non-completed phase on a live
project (BR-054) and suggests completion for any whose tasks are all done,
catching anything an event missed. Both paths share the same phase-service
helper and the same per-phase-per-day ``group_key``, so nobody is notified twice.
"""

from __future__ import annotations

from datetime import datetime

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.automations._helpers import LIVE_PROJECT_STATUSES, resolve_today
from app.models.project import Project, ProjectPhase
from app.services import phase_service

logger = structlog.get_logger("aurea.automation.phase_completion")

CODE = "AUTO-07"


def execute(db: Session, *, now: datetime | None = None) -> int:
    today = resolve_today(now)
    phases = list(
        db.execute(
            select(ProjectPhase)
            .join(Project, ProjectPhase.project_id == Project.id)
            .where(
                ProjectPhase.status != "completed",
                Project.status.in_(LIVE_PROJECT_STATUSES),
            )
        ).scalars()
    )
    created = sum(
        1
        for phase in phases
        if phase_service.suggest_completion_if_ready(db, phase, run_date=today)
    )
    logger.info("auto07_phase_completion", checked=len(phases), notified=created)
    return created
