"""AUTO-03 — stale-opportunity flagging (BR-014).

Daily. An OPEN opportunity is stale when it has had no interaction in the last 14
days OR its ``next_action_due`` is in the past. The opportunity owner and every
Admin are notified. Idempotent via a per-opportunity-per-day ``group_key``.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.automations._helpers import group_key, resolve_now
from app.models.crm import Interaction, Opportunity
from app.repositories import notifications as notification_repo
from app.services import notification_service

logger = structlog.get_logger("leiritech.automation.opportunity_stale")

CODE = "AUTO-03"
STALE_DAYS = 14


def execute(db: Session, *, now: datetime | None = None) -> int:
    ref = resolve_now(now)
    today = ref.date()
    cutoff = ref - timedelta(days=STALE_DAYS)

    opportunities = list(
        db.execute(
            select(Opportunity).where(
                Opportunity.outcome == "open",
                Opportunity.archived_at.is_(None),
            )
        ).scalars()
    )
    if not opportunities:
        return 0

    # Last interaction timestamp per opportunity in one grouped read.
    last_interaction: dict = dict(
        db.execute(
            select(
                Interaction.opportunity_id,
                func.max(Interaction.occurred_at),
            )
            .where(Interaction.opportunity_id.is_not(None))
            .group_by(Interaction.opportunity_id)
        ).all()
    )
    admin_ids = notification_repo.admin_ids(db)

    created = 0
    stale = 0
    for opp in opportunities:
        last = last_interaction.get(opp.id)
        no_recent_activity = last is None or last < cutoff
        action_overdue = (
            opp.next_action_due is not None and opp.next_action_due < today
        )
        if not (no_recent_activity or action_overdue):
            continue
        stale += 1
        recipients = [opp.owner_id, *admin_ids]
        created += notification_service.notify_many(
            db,
            user_ids=recipients,
            type="opportunity_stale",
            body=(
                f"Oportunidade «{opp.title}» sem atividade / próxima ação em "
                f"atraso."
            ),
            entity_type="opportunity",
            entity_id=opp.id,
            group_key=group_key(CODE, opp.id, today),
        )
    logger.info("auto03_opportunity_stale", flagged=stale, notified=created)
    return created
