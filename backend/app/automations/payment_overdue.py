"""AUTO-02 — overdue payment-milestone flagging (BR-068).

Daily. Every open milestone (planned/invoiced/partially_paid) past its
``expected_date`` is transitioned to ``overdue`` and the financial audience
(Admin + Gestor-with-grant, BR-008) is notified. Runs regardless of project
state (external reconciliation may outlive delivery, BR-054).

The state transition lives in ``finance_service.expire_overdue_milestones`` so
the finance state machine stays in one place; this module wires it to
notifications. Idempotent by state: a milestone flipped to ``overdue`` is not
re-selected, so it is notified exactly once.
"""

from __future__ import annotations

from datetime import datetime

import structlog
from sqlalchemy.orm import Session

from app.automations._helpers import group_key, resolve_today
from app.repositories import notifications as notification_repo
from app.services import finance_service, notification_service

logger = structlog.get_logger("leiritech.automation.payment_overdue")

CODE = "AUTO-02"


def execute(db: Session, *, now: datetime | None = None) -> int:
    today = resolve_today(now)
    overdue = finance_service.expire_overdue_milestones(db, today=today)
    if not overdue:
        logger.info("auto02_payment_overdue", flagged=0, notified=0)
        return 0

    recipients = notification_repo.finance_recipient_ids(db)
    created = 0
    for milestone in overdue:
        label = milestone.reference or milestone.description or "sem referência"
        amount = (milestone.amount or 0) / 100
        created += notification_service.notify_many(
            db,
            user_ids=recipients,
            type="payment_overdue",
            body=f"Marco de pagamento «{label}» ({amount:.2f}€) está vencido.",
            entity_type="payment_milestone",
            entity_id=milestone.id,
            group_key=group_key(CODE, milestone.id, today),
        )
    logger.info("auto02_payment_overdue", flagged=len(overdue), notified=created)
    return created
