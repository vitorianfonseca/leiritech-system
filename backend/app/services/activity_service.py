"""Append-only activity-log helper (BR-064).

The audit trail is polymorphic via ``(entity_type, entity_id)`` so any domain can
record events without a hard FK. Rows are only ever inserted here — there is no
update/delete path, which is what keeps the log tamper-evident (BR-064). Other
domains (projects, tasks, finance) reuse ``record`` for their own audit entries.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.collaboration import ActivityLog

logger = structlog.get_logger("leiritech.activity")


def record(
    db: Session,
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    actor_id: uuid.UUID | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> ActivityLog:
    """Append one audit entry. Never mutates existing rows (BR-064)."""
    entry = ActivityLog(
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_id,
        action=action,
        before=before,
        after=after,
        occurred_at=datetime.now(tz=UTC),
    )
    db.add(entry)
    logger.info(
        "activity_recorded",
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        actor_id=str(actor_id) if actor_id else None,
    )
    return entry


def list_for_entity(
    db: Session, *, entity_type: str, entity_id: uuid.UUID, limit: int = 100
) -> list[ActivityLog]:
    """Most-recent-first audit entries for a single entity."""
    return list(
        db.execute(
            select(ActivityLog)
            .where(
                ActivityLog.entity_type == entity_type,
                ActivityLog.entity_id == entity_id,
            )
            .order_by(ActivityLog.occurred_at.desc())
            .limit(limit)
        ).scalars()
    )
