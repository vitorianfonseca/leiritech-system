"""Time-tracking business logic (F11 — BR-040..044).

Every time mutation flows through here so the single-active-timer rule (BR-040),
the task-attribution + visibility boundary (BR-041 / BR-002), the manual-entry
validation (BR-044) and the audit trail (BR-064) live in exactly one place.
Route handlers stay thin.

Two rules are deliberately NOT re-implemented here:
  * BR-042 (stop running timers when a project is paused/closed or a task is
    archived) lives in ``project_repo.stop_running_timers`` and is invoked by the
    project cascade — the time domain does not own that trigger.
  * Task visibility (BR-002/H7) is delegated to ``task_service.get_task_or_404``
    so a Membro cannot log time against a task they cannot see.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import Role, role_at_least
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.repositories import time as time_repo
from app.schemas.time import (
    MAX_ENTRY_DURATION,
    ManualTimeEntryCreate,
    TimeEntryUpdate,
    TimerStart,
)
from app.services import activity_service, task_service

logger = structlog.get_logger("leiritech.time")

ENTITY_TYPE = "time_entry"

_SNAPSHOT_FIELDS = ("user_id", "task_id", "started_at", "ended_at", "billable")


def _snapshot(entry: TimeEntry) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in _SNAPSHOT_FIELDS:
        value = getattr(entry, field)
        if isinstance(value, uuid.UUID):
            value = str(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        out[field] = value
    return out


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def close_running_entry(entry: TimeEntry, *, now: datetime | None = None) -> None:
    """Set ``ended_at`` on a running entry, guarding against clock skew so the
    closed interval is never non-positive. The single source of truth for
    closing a timer — used by :func:`stop_timer` and by any other caller that
    force-closes a timer outside the normal stop flow (e.g. BR-006's
    deactivation cascade in ``user_service``, audit H21) — so rounding stays
    consistent everywhere a timer is closed."""
    now = now or datetime.now(tz=UTC)
    entry.ended_at = max(now, _as_utc(entry.started_at))


# --------------------------------------------------------------------------- #
# Loads / ownership (BR-002 — a user manages only their OWN time entries)
# --------------------------------------------------------------------------- #
def _own_entry_or_404(db: Session, user: User, entry_id: uuid.UUID) -> TimeEntry:
    """Load an entry the caller owns. A non-owner gets 404 (not 403) so entries
    cannot be enumerated (BR-002)."""
    entry = time_repo.get_entry(db, entry_id)
    if entry is None or entry.user_id != user.id:
        raise errors.not_found(
            "Registo de tempo não encontrado.", code="TIME_ENTRY_NOT_FOUND"
        )
    return entry


# --------------------------------------------------------------------------- #
# Timer (start / stop / active)
# --------------------------------------------------------------------------- #
def start_timer(db: Session, user: User, payload: TimerStart) -> TimeEntry:
    """Start the single running timer on a task (BR-040/BR-041).

    A second concurrent timer is rejected with 409. The DB partial unique index
    ``uq_time_entries_active_per_user`` is the backstop against races: an
    ``IntegrityError`` from it is translated to the same 409, never a 500.
    """
    # BR-041 + BR-002: the task must exist and be visible to the caller.
    task_service.get_task_or_404(db, user, payload.task_id)

    if time_repo.get_active_entry(db, user.id) is not None:
        raise errors.conflict(
            "Já tem um cronómetro ativo. Pare-o antes de iniciar outro.",
            code="TIMER_ALREADY_ACTIVE",
        )

    entry = TimeEntry(
        user_id=user.id,
        task_id=payload.task_id,
        started_at=datetime.now(tz=UTC),
        ended_at=None,
        description=payload.description,
        # BR-043 — billable set at entry; defaults on when not specified.
        billable=payload.billable if payload.billable is not None else True,
        created_by=user.id,
    )
    try:
        with db.begin_nested():
            db.add(entry)
            db.flush()
    except IntegrityError as exc:
        # Lost the race to the partial unique index → surface as 409, not 500.
        raise errors.conflict(
            "Já tem um cronómetro ativo. Pare-o antes de iniciar outro.",
            code="TIMER_ALREADY_ACTIVE",
        ) from exc

    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=entry.id,
        action="time_entry.timer_started",
        actor_id=user.id,
        after=_snapshot(entry),
    )
    logger.info(
        "timer_started",
        entry_id=str(entry.id),
        task_id=str(payload.task_id),
        actor_id=str(user.id),
    )
    return entry


def stop_timer(db: Session, user: User) -> TimeEntry:
    """Stop the caller's running timer and close the interval."""
    entry = time_repo.get_active_entry(db, user.id)
    if entry is None:
        raise errors.conflict(
            "Não tem nenhum cronómetro ativo.", code="NO_ACTIVE_TIMER"
        )
    before = _snapshot(entry)
    close_running_entry(entry)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=entry.id,
        action="time_entry.timer_stopped",
        actor_id=user.id,
        before=before,
        after=_snapshot(entry),
    )
    logger.info("timer_stopped", entry_id=str(entry.id), actor_id=str(user.id))
    return entry


def get_active_timer(db: Session, user: User) -> TimeEntry | None:
    return time_repo.get_active_entry(db, user.id)


# --------------------------------------------------------------------------- #
# Manual entries
# --------------------------------------------------------------------------- #
def create_manual_entry(
    db: Session, user: User, payload: ManualTimeEntryCreate
) -> TimeEntry:
    """Create an already-closed manual entry (BR-044 validated in the schema).

    A closed entry (``ended_at`` set) does not participate in the single-active
    partial index, so it cannot collide with a running timer.
    """
    task_service.get_task_or_404(db, user, payload.task_id)  # BR-041 + visibility

    entry = TimeEntry(
        user_id=user.id,
        task_id=payload.task_id,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        description=payload.description,
        billable=payload.billable,
        created_by=user.id,
    )
    db.add(entry)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=entry.id,
        action="time_entry.created",
        actor_id=user.id,
        after=_snapshot(entry),
    )
    logger.info(
        "time_entry_created",
        entry_id=str(entry.id),
        task_id=str(payload.task_id),
        actor_id=str(user.id),
    )
    return entry


def update_entry(
    db: Session, user: User, entry_id: uuid.UUID, payload: TimeEntryUpdate
) -> TimeEntry:
    """Edit an owned entry. Re-validates the resulting interval (BR-044) against
    the merged values. Re-opening a closed entry (setting ``ended_at`` back to
    null) is rejected to avoid resurrecting a second running timer (BR-040)."""
    entry = _own_entry_or_404(db, user, entry_id)
    changes = payload.model_dump(exclude_unset=True)

    if "ended_at" in changes and changes["ended_at"] is None and entry.ended_at is not None:
        raise errors.bad_request(
            "Não é possível reabrir um registo já terminado.",
            code="TIME_ENTRY_CANNOT_REOPEN",
        )

    new_started = changes.get("started_at", entry.started_at)
    new_ended = changes.get("ended_at", entry.ended_at)
    if new_ended is not None:
        _assert_interval(new_started, new_ended)

    before = _snapshot(entry)
    for field, value in changes.items():
        setattr(entry, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=entry.id,
        action="time_entry.updated",
        actor_id=user.id,
        before=before,
        after=_snapshot(entry),
    )
    logger.info(
        "time_entry_updated",
        entry_id=str(entry.id),
        actor_id=str(user.id),
        fields=sorted(changes.keys()),
    )
    return entry


def delete_entry(db: Session, user: User, entry_id: uuid.UUID) -> None:
    entry = _own_entry_or_404(db, user, entry_id)
    db.delete(entry)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=entry_id,
        action="time_entry.deleted",
        actor_id=user.id,
        before=_snapshot(entry),
    )
    logger.info("time_entry_deleted", entry_id=str(entry_id), actor_id=str(user.id))


# --------------------------------------------------------------------------- #
# Listing (BR-002 — own by default; a Gestor+ may query a team member)
# --------------------------------------------------------------------------- #
def list_entries(
    db: Session,
    user: User,
    *,
    user_id: uuid.UUID | None,
    task_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    started_from: datetime | None,
    started_to: datetime | None,
    page: int,
    page_size: int,
) -> tuple[list[TimeEntry], int]:
    target_user_id = user.id
    if user_id is not None and user_id != user.id:
        # Only a Gestor/Admin may read another member's time (PRD F11 / BR-002).
        if not role_at_least(user.role, Role.GESTOR):
            raise errors.forbidden(
                "Só pode consultar os seus próprios registos de tempo.",
                code="TIME_ENTRY_SCOPE_FORBIDDEN",
            )
        target_user_id = user_id

    return time_repo.list_entries(
        db,
        user_id=target_user_id,
        task_id=task_id,
        project_id=project_id,
        started_from=started_from,
        started_to=started_to,
        page=page,
        page_size=page_size,
    )


# --------------------------------------------------------------------------- #
# Validation helpers
# --------------------------------------------------------------------------- #
def _assert_interval(started_at: datetime, ended_at: datetime) -> None:
    """BR-044 for the closed interval formed by a partial update."""
    start = _as_utc(started_at)
    end = _as_utc(ended_at)
    if end <= start:
        raise errors.bad_request(
            "O fim tem de ser posterior ao início.",
            code="TIME_ENTRY_INVALID_INTERVAL",
        )
    now = datetime.now(tz=UTC)
    if start > now + timedelta(minutes=1) or end > now + timedelta(minutes=1):
        raise errors.bad_request(
            "Um registo de tempo não pode estar no futuro.",
            code="TIME_ENTRY_IN_FUTURE",
        )
    if end - start > MAX_ENTRY_DURATION:
        raise errors.bad_request(
            "Um registo de tempo não pode exceder 24 horas.",
            code="TIME_ENTRY_TOO_LONG",
        )
