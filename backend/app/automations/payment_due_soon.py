"""AUTO-08 — payment-milestone due-soon flagging (BR-067).

Daily. Every open milestone due within 7 days on a LIVE project (BR-054) warns
the financial audience (Admin + Gestor-with-grant, BR-008). No state change —
idempotent via a per-milestone-per-day ``group_key``.
"""

from __future__ import annotations

from datetime import datetime

import structlog
from sqlalchemy.orm import Session

from app.automations._helpers import (
    LIVE_PROJECT_STATUSES,
    group_key,
    resolve_today,
)
from app.repositories import finance as finance_repo
from app.repositories import notifications as notification_repo
from app.services import notification_service

logger = structlog.get_logger("aurea.automation.payment_due_soon")

CODE = "AUTO-08"
WINDOW_DAYS = 7


def execute(db: Session, *, now: datetime | None = None) -> int:
    today = resolve_today(now)
    milestones = finance_repo.due_soon_milestones(
        db,
        today=today,
        within_days=WINDOW_DAYS,
        live_statuses=LIVE_PROJECT_STATUSES,
    )
    recipients = notification_repo.finance_recipient_ids(db)
    created = 0
    for milestone in milestones:
        label = milestone.reference or milestone.description or "sem referência"
        amount = (milestone.amount or 0) / 100
        created += notification_service.notify_many(
            db,
            user_ids=recipients,
            type="payment_due_soon",
            body=(
                f"Marco «{label}» previsto para {milestone.expected_date} "
                f"({amount:.2f}€)."
            ),
            entity_type="payment_milestone",
            entity_id=milestone.id,
            group_key=group_key(CODE, milestone.id, today),
        )
    logger.info("auto08_payment_due_soon", flagged=len(milestones), notified=created)
    return created
