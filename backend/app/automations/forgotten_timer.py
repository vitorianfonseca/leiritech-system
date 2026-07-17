"""AUTO-12 — forgotten timer (BR-040 hygiene).

Daily/overnight. A running timer (``ended_at IS NULL``) that has been going for
more than 8 hours OR was started on an earlier calendar day nudges its owner to
stop it. Idempotent via a per-timer-per-day ``group_key``.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.automations._helpers import group_key, resolve_now
from app.models.time_entry import TimeEntry
from app.services import notification_service

logger = structlog.get_logger("aurea.automation.forgotten_timer")

CODE = "AUTO-12"
MAX_RUNNING_HOURS = 8


def execute(db: Session, *, now: datetime | None = None) -> int:
    ref = resolve_now(now)
    long_running_cutoff = ref - timedelta(hours=MAX_RUNNING_HOURS)
    day_start = ref.replace(hour=0, minute=0, second=0, microsecond=0)

    entries = list(
        db.execute(
            select(TimeEntry).where(
                TimeEntry.ended_at.is_(None),
                or_(
                    TimeEntry.started_at < long_running_cutoff,
                    TimeEntry.started_at < day_start,
                ),
            )
        ).scalars()
    )
    created = 0
    for entry in entries:
        hours = int((ref - entry.started_at).total_seconds() // 3600)
        if (
            notification_service.create_notification(
                db,
                user_id=entry.user_id,
                type="forgotten_timer",
                body=f"Tem um cronómetro a correr há {hours}h. Deseja pará-lo?",
                entity_type="time_entry",
                entity_id=entry.id,
                group_key=group_key(CODE, entry.id, ref.date()),
            )
            is not None
        ):
            created += 1
    logger.info("auto12_forgotten_timer", running=len(entries), notified=created)
    return created
