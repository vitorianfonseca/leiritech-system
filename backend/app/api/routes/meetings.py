"""Meeting routes (WORKFLOW_SPEC §1.9, audit C11)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.meetings import (
    MeetingCreate,
    MeetingHeld,
    MeetingReschedule,
    MeetingResponse,
)
from app.services import meeting_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[MeetingResponse])
def list_meetings(
    user: CurrentUser,
    db: DbSession,
    company_id: uuid.UUID | None = None,
    opportunity_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    upcoming_only: Annotated[bool, Query()] = False,
) -> list[MeetingResponse]:
    meetings = meeting_service.list_meetings(
        db,
        user,
        company_id=company_id,
        opportunity_id=opportunity_id,
        project_id=project_id,
        upcoming_only=upcoming_only,
    )
    return [MeetingResponse.model_validate(m) for m in meetings]


@router.post("", response_model=MeetingResponse, status_code=201)
def create_meeting(
    payload: MeetingCreate, user: CurrentUser, db: DbSession
) -> MeetingResponse:
    meeting = meeting_service.create_meeting(db, user, payload)
    return MeetingResponse.model_validate(meeting)


@router.get("/{meeting_id}", response_model=MeetingResponse)
def get_meeting(
    meeting_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> MeetingResponse:
    meeting = meeting_service.get_meeting_or_404(db, user, meeting_id)
    return MeetingResponse.model_validate(meeting)


@router.post("/{meeting_id}/held", response_model=MeetingResponse)
def mark_held(
    meeting_id: uuid.UUID,
    payload: MeetingHeld,
    user: CurrentUser,
    db: DbSession,
) -> MeetingResponse:
    meeting = meeting_service.mark_held(db, user, meeting_id, payload)
    return MeetingResponse.model_validate(meeting)


@router.post("/{meeting_id}/cancel", response_model=MeetingResponse)
def cancel_meeting(
    meeting_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> MeetingResponse:
    meeting = meeting_service.cancel_meeting(db, user, meeting_id)
    return MeetingResponse.model_validate(meeting)


@router.post("/{meeting_id}/no-show", response_model=MeetingResponse)
def mark_no_show(
    meeting_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> MeetingResponse:
    meeting = meeting_service.mark_no_show(db, user, meeting_id)
    return MeetingResponse.model_validate(meeting)


@router.post("/{meeting_id}/reschedule", response_model=MeetingResponse)
def reschedule_meeting(
    meeting_id: uuid.UUID,
    payload: MeetingReschedule,
    user: CurrentUser,
    db: DbSession,
) -> MeetingResponse:
    meeting = meeting_service.reschedule_meeting(db, user, meeting_id, payload)
    return MeetingResponse.model_validate(meeting)
