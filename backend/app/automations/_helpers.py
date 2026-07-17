"""Shared constants and small helpers for the scheduled automations (F15 §6.1).

Each automation is a pure ``execute(db, *, now=None) -> int`` that flushes but
never commits — the dispatcher owns the transaction. Idempotency is achieved by
stamping a per-entity-per-day ``group_key`` on every notification produced
(``group_key`` de-dupes in ``notification_service.create_notification``), so a
re-run on the same day creates nothing new. Some automations are additionally
idempotent by state (AUTO-02/AUTO-04 flip a status so the source query no longer
selects the row on the next run).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

# BR-054 — project-linked crons run ONLY for live projects. Mirrors
# ``project_service._LIVE_STATUSES`` (kept as a local constant so the automations
# layer does not reach into a service's private name).
LIVE_PROJECT_STATUSES = ("planning", "active", "on_hold")


def resolve_now(now: datetime | None) -> datetime:
    """The reference instant for a run (injectable so tests are deterministic)."""
    return now or datetime.now(tz=UTC)


def resolve_today(now: datetime | None) -> date:
    """The reference calendar date (UTC) for a daily run."""
    return resolve_now(now).astimezone(UTC).date()


def group_key(code: str, entity_id: uuid.UUID, run_date: date) -> str:
    """Per-entity-per-day idempotency key, e.g. ``AUTO-01:<uuid>:2026-07-17``."""
    return f"{code}:{entity_id}:{run_date.isoformat()}"
