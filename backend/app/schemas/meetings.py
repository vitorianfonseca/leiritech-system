"""Pydantic v2 schemas for meetings (WORKFLOW_SPEC §1.9, audit C11).

The Meeting entity has its own state machine (scheduled/held/cancelled/
no_show) distinct from the generic Interaction timeline — "held" feeds an
interaction record and AUTO-10 (meeting reminder) needs a real start_at,
organizer and status to work from.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MeetingStatus = Literal["scheduled", "held", "cancelled", "no_show"]


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    start_at: datetime
    end_at: datetime | None = None
    company_id: uuid.UUID | None = None
    opportunity_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _at_least_one_link(self) -> MeetingCreate:
        if not (self.company_id or self.opportunity_id or self.project_id):
            raise ValueError(
                "A meeting must be linked to a company, opportunity, or project."
            )
        return self


class MeetingHeld(BaseModel):
    outcome_note: str | None = Field(default=None, max_length=4000)


class MeetingReschedule(BaseModel):
    start_at: datetime
    end_at: datetime | None = None


class MeetingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    start_at: datetime
    end_at: datetime | None
    organizer_id: uuid.UUID | None
    company_id: uuid.UUID | None
    opportunity_id: uuid.UUID | None
    project_id: uuid.UUID | None
    outcome_note: str | None
    status: MeetingStatus
    created_at: datetime
    updated_at: datetime
