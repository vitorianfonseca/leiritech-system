"""AUTO-11 — won opportunity not yet converted to a project.

Daily. A ``won`` opportunity with no linked project after more than 3 days nudges
its owner and every Admin to convert it (BR-035 spin-up). Idempotent via a
per-opportunity-per-day ``group_key``.

Seam: the schema has no ``won_at`` timestamp, so "won > 3 days" is approximated
from ``updated_at`` (the win is the most recent mutation in practice). Flagged —
add ``won_at`` to make the threshold exact.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.automations._helpers import group_key, resolve_now
from app.models.crm import Opportunity
from app.models.project import Project
from app.repositories import notifications as notification_repo
from app.services import notification_service

logger = structlog.get_logger("leiritech.automation.won_without_project")

CODE = "AUTO-11"
GRACE_DAYS = 3


def execute(db: Session, *, now: datetime | None = None) -> int:
    ref = resolve_now(now)
    cutoff = ref - timedelta(days=GRACE_DAYS)

    linked = select(Project.opportunity_id).where(
        Project.opportunity_id.is_not(None)
    )
    opportunities = list(
        db.execute(
            select(Opportunity).where(
                Opportunity.outcome == "won",
                Opportunity.archived_at.is_(None),
                Opportunity.updated_at < cutoff,
                Opportunity.id.not_in(linked),
            )
        ).scalars()
    )
    admin_ids = notification_repo.admin_ids(db)
    created = 0
    for opp in opportunities:
        created += notification_service.notify_many(
            db,
            user_ids=[opp.owner_id, *admin_ids],
            type="won_without_project",
            body=(
                f"Oportunidade ganha «{opp.title}» ainda não foi convertida em "
                f"projeto."
            ),
            entity_type="opportunity",
            entity_id=opp.id,
            group_key=group_key(CODE, opp.id, ref.date()),
        )
    logger.info("auto11_won_without_project", flagged=len(opportunities), notified=created)
    return created
