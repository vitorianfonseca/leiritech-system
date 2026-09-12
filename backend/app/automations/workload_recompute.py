"""AUTO-09 — capacity / workload recompute (BR-084).

Daily. Recomputes each active member's live allocation and, for anyone
``sobrecarregado`` (over-allocated), warns the management audience (active Admins
and Gestores). Nothing is stored — availability is derived — so idempotency is
provided by a per-member-per-day ``group_key``.

Consumes the workload seam directly: ``workload_service.compute_entry`` and the
allocation read in ``workload_repo``. Over-allocation depends only on assigned
load, so billable hours are irrelevant here and passed as 0.
"""

from __future__ import annotations

from datetime import datetime

import structlog
from sqlalchemy.orm import Session

from app.automations._helpers import group_key, resolve_today
from app.repositories import notifications as notification_repo
from app.repositories import workload as workload_repo
from app.services import notification_service, workload_service

logger = structlog.get_logger("leiritech.automation.workload_recompute")

CODE = "AUTO-09"


def execute(db: Session, *, now: datetime | None = None) -> int:
    today = resolve_today(now)
    users = workload_repo.active_users(db)
    allocated = workload_repo.allocated_hours_by_user(db)
    recipients = notification_repo.manager_recipient_ids(db)

    created = 0
    over = 0
    for user in users:
        entry = workload_service.compute_entry(
            user, allocated.get(user.id, 0.0), billable_hours_week=0.0
        )
        if not entry.over_allocated:
            continue
        over += 1
        created += notification_service.notify_many(
            db,
            user_ids=recipients,
            type="workload_over_allocated",
            body=(
                f"{user.name} está sobrecarregado(a) "
                f"({entry.allocation_pct:.0f}% da capacidade)."
            ),
            entity_type="user",
            entity_id=user.id,
            group_key=group_key(CODE, user.id, today),
        )
    logger.info("auto09_workload_recompute", over_allocated=over, notified=created)
    return created
