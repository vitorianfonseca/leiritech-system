"""AUTO-05 — suggested-health recompute (BR-032).

Daily. Recomputes ``suggested_health`` for every live project (BR-054) using the
``project_service.compute_suggested_health`` heuristic and persists it. On a
DOWNGRADE (healthy → attention → at_risk) the project's Gestor/owner is notified.
Never publishes — automation only ever touches ``suggested_health`` (BR-030).

Idempotent: the suggestion is persisted, so a second run sees no change and
therefore no downgrade; a per-project-per-day ``group_key`` guards the notify.
"""

from __future__ import annotations

from datetime import datetime

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.automations._helpers import (
    LIVE_PROJECT_STATUSES,
    group_key,
    resolve_today,
)
from app.models.project import Project
from app.services import notification_service, project_service

logger = structlog.get_logger("leiritech.automation.health_recompute")

CODE = "AUTO-05"

# Severity ranking — a higher rank is worse; a rank increase is a downgrade.
_SEVERITY = {"healthy": 0, "attention": 1, "at_risk": 2}
_LABELS = {"healthy": "saudável", "attention": "atenção", "at_risk": "em risco"}


def _is_downgrade(old: str | None, new: str | None) -> bool:
    if new is None or old is None:
        return False
    return _SEVERITY.get(new, 0) > _SEVERITY.get(old, 0)


def execute(db: Session, *, now: datetime | None = None) -> int:
    today = resolve_today(now)
    projects = list(
        db.execute(
            select(Project).where(Project.status.in_(LIVE_PROJECT_STATUSES))
        ).scalars()
    )

    created = 0
    for project in projects:
        old = project.suggested_health
        new = project_service.compute_suggested_health(db, project)
        project.suggested_health = new
        db.flush()
        if _is_downgrade(old, new) and project.manager_id is not None:
            label = _LABELS.get(new, new)
            if (
                notification_service.create_notification(
                    db,
                    user_id=project.manager_id,
                    type="project_health_downgrade",
                    body=f"Saúde sugerida do projeto «{project.name}» mudou para {label}.",
                    entity_type="project",
                    entity_id=project.id,
                    group_key=group_key(CODE, project.id, today),
                )
                is not None
            ):
                created += 1
    logger.info("auto05_health_recompute", projects=len(projects), notified=created)
    return created
