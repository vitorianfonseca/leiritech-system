"""Pydantic v2 schemas for time tracking (F11 — BR-040..044).

The single-active-timer rule (BR-040) and the task-attribution rule (BR-041) are
enforced in ``time_service`` / the DB; these schemas shape payloads and apply the
manual-entry validation (BR-044 — ``ended_at`` must be after ``started_at``, must
not be in the future, and must not span more than 24h). Durations are never sent
by the client: timestamps are stored and ``duration_minutes`` is derived here.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

# BR-044 — a single time entry may not span more than 24 hours.
MAX_ENTRY_DURATION = timedelta(hours=24)


def _as_utc(value: datetime) -> datetime:
    """Normalize to an aware UTC datetime so comparisons never mix naive/aware."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _validate_interval(started_at: datetime, ended_at: datetime) -> None:
    """Shared BR-044 checks for a closed interval. Raises ``ValueError`` (→ 422)."""
    start = _as_utc(started_at)
    end = _as_utc(ended_at)
    if end <= start:
        raise ValueError("O fim tem de ser posterior ao início.")
    now = datetime.now(tz=UTC)
    # Small tolerance so a client clock a few seconds ahead is not rejected.
    if start > now + timedelta(minutes=1) or end > now + timedelta(minutes=1):
        raise ValueError("Um registo de tempo não pode estar no futuro.")
    if end - start > MAX_ENTRY_DURATION:
        raise ValueError("Um registo de tempo não pode exceder 24 horas.")


# --------------------------------------------------------------------------- #
# Timer (start / stop)
# --------------------------------------------------------------------------- #
class TimerStart(BaseModel):
    """Start the (single) running timer on a task. ``billable`` defaults from the
    task/project nature server-side when omitted (BR-043)."""

    task_id: uuid.UUID
    description: str | None = Field(default=None, max_length=512)
    billable: bool | None = None


# --------------------------------------------------------------------------- #
# Manual entries
# --------------------------------------------------------------------------- #
class ManualTimeEntryCreate(BaseModel):
    """A manually logged, already-closed time entry (BR-044 validated)."""

    task_id: uuid.UUID
    started_at: datetime
    ended_at: datetime
    description: str | None = Field(default=None, max_length=512)
    billable: bool = True

    @model_validator(mode="after")
    def _check_interval(self) -> Self:
        _validate_interval(self.started_at, self.ended_at)
        return self


class TimeEntryUpdate(BaseModel):
    """Partial edit of an existing entry. Cross-field validation of the resulting
    interval happens in the service against the merged values, because either
    endpoint may be omitted here."""

    started_at: datetime | None = None
    ended_at: datetime | None = None
    description: str | None = Field(default=None, max_length=512)
    billable: bool | None = None


# --------------------------------------------------------------------------- #
# Response
# --------------------------------------------------------------------------- #
class TimeEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    task_id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    description: str | None
    billable: bool
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_running(self) -> bool:
        return self.ended_at is None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def duration_minutes(self) -> int | None:
        """Whole minutes between start and end; ``None`` while the timer runs."""
        if self.ended_at is None:
            return None
        delta = _as_utc(self.ended_at) - _as_utc(self.started_at)
        return int(delta.total_seconds() // 60)
