"""AUTO-10 — meeting reminder.

Reminds meeting participants ahead of the meeting ``start_at``. The data model
has no meeting-participants table (``Meeting`` carries only ``organizer_id``), so
this notifies the ORGANIZER — flagged as a seam to widen once participants are
modelled. Run as a daily job it reminds about meetings ``scheduled`` to start
within the next 24 hours. Idempotent via a per-meeting-per-day ``group_key``.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.automations._helpers import group_key, resolve_now
from app.models.crm import Meeting
from app.services import notification_service

logger = structlog.get_logger("leiritech.automation.meeting_reminder")

CODE = "AUTO-10"
WINDOW_HOURS = 24


def execute(db: Session, *, now: datetime | None = None) -> int:
    ref = resolve_now(now)
    horizon = ref + timedelta(hours=WINDOW_HOURS)
    meetings = list(
        db.execute(
            select(Meeting).where(
                Meeting.status == "scheduled",
                Meeting.start_at >= ref,
                Meeting.start_at <= horizon,
            )
        ).scalars()
    )
    created = 0
    for meeting in meetings:
        if meeting.organizer_id is None:
            continue
        if (
            notification_service.create_notification(
                db,
                user_id=meeting.organizer_id,
                type="meeting_reminder",
                body=f"Reunião «{meeting.title}» começa em breve.",
                entity_type="meeting",
                entity_id=meeting.id,
                group_key=group_key(CODE, meeting.id, ref.date()),
            )
            is not None
        ):
            created += 1
    logger.info("auto10_meeting_reminder", upcoming=len(meetings), notified=created)
    return created
