"""Time-tracking routes (F11 — single active timer, manual entries, validation).

The single-active-timer rule (BR-040), task attribution (BR-041), manual-entry
validation (BR-044) and ownership scoping (BR-002 — a user manages only their own
entries; a Gestor+ may read a team member's) all live in ``time_service``; these
handlers only wire HTTP to the service.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.time import (
    ManualTimeEntryCreate,
    TimeEntryResponse,
    TimeEntryUpdate,
    TimerStart,
)
from app.services import time_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


# --------------------------------------------------------------------------- #
# Timer (start / stop / active) — BR-040
# --------------------------------------------------------------------------- #
@router.post(
    "/start", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED
)
def start_timer(
    payload: TimerStart, user: CurrentUser, db: DbSession
) -> TimeEntryResponse:
    entry = time_service.start_timer(db, user, payload)
    return TimeEntryResponse.model_validate(entry)


@router.post("/stop", response_model=TimeEntryResponse)
def stop_timer(user: CurrentUser, db: DbSession) -> TimeEntryResponse:
    entry = time_service.stop_timer(db, user)
    return TimeEntryResponse.model_validate(entry)


@router.get("/active", response_model=TimeEntryResponse | None)
def get_active_timer(
    user: CurrentUser, db: DbSession
) -> TimeEntryResponse | None:
    entry = time_service.get_active_timer(db, user)
    return TimeEntryResponse.model_validate(entry) if entry is not None else None


# --------------------------------------------------------------------------- #
# List / create manual entries
# --------------------------------------------------------------------------- #
@router.get("", response_model=Page[TimeEntryResponse])
def list_time_entries(
    user: CurrentUser,
    db: DbSession,
    user_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    started_from: datetime | None = None,
    started_to: datetime | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[TimeEntryResponse]:
    entries, total = time_service.list_entries(
        db,
        user,
        user_id=user_id,
        task_id=task_id,
        project_id=project_id,
        started_from=started_from,
        started_to=started_to,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[TimeEntryResponse.model_validate(e) for e in entries],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
def create_time_entry(
    payload: ManualTimeEntryCreate, user: CurrentUser, db: DbSession
) -> TimeEntryResponse:
    entry = time_service.create_manual_entry(db, user, payload)
    return TimeEntryResponse.model_validate(entry)


# --------------------------------------------------------------------------- #
# Single entry — update / delete (owner only)
# --------------------------------------------------------------------------- #
@router.patch("/{entry_id}", response_model=TimeEntryResponse)
def update_time_entry(
    entry_id: uuid.UUID,
    payload: TimeEntryUpdate,
    user: CurrentUser,
    db: DbSession,
) -> TimeEntryResponse:
    entry = time_service.update_entry(db, user, entry_id, payload)
    return TimeEntryResponse.model_validate(entry)


@router.delete(
    "/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
def delete_time_entry(
    entry_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    time_service.delete_entry(db, user, entry_id)
