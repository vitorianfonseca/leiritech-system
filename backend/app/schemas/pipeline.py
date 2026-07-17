"""Pydantic v2 schemas for the commercial pipeline (F5) and won→project
handoff (F7).

Money is integer EUR cents. Status literals mirror ``app.models.enums`` (the
persisted English keys) so invalid values are rejected with a 422 at the edge
before reaching the service layer. Business-rule guards that need database
context (BR-010 próxima-ação, BR-011 lost-reason on a stored row, BR-013 no
revert) live in ``opportunity_service``.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

OpportunityOutcome = Literal["open", "won", "lost"]


# --------------------------------------------------------------------------- #
# Pipeline stages (BR-012 / BR-020 — admin-configurable)
# --------------------------------------------------------------------------- #
class PipelineStageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=32)
    order_index: int = Field(default=0, ge=0)
    win_probability: int | None = Field(default=None, ge=0, le=100)


class PipelineStageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    color: str | None = Field(default=None, max_length=32)
    order_index: int | None = Field(default=None, ge=0)
    win_probability: int | None = Field(default=None, ge=0, le=100)


class PipelineStageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    color: str | None
    order_index: int
    win_probability: int | None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Opportunities
# --------------------------------------------------------------------------- #
class OpportunityCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    primary_contact_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    stage_id: uuid.UUID | None = None
    estimated_value: int | None = Field(default=None, ge=0)  # EUR cents
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: date | None = None
    source: str | None = Field(default=None, max_length=128)
    description: str | None = None
    # BR-010: an open opportunity always carries a próxima ação. Enforced here at
    # create because every opportunity starts ``open``.
    next_action: str = Field(min_length=1, max_length=512)
    next_action_due: date | None = None


class OpportunityUpdate(BaseModel):
    """Partial update of attributes. Lifecycle transitions (move/win/lose/
    convert) have dedicated endpoints and are NOT settable here."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    primary_contact_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    estimated_value: int | None = Field(default=None, ge=0)
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: date | None = None
    source: str | None = Field(default=None, max_length=128)
    description: str | None = None
    next_action: str | None = Field(default=None, min_length=1, max_length=512)
    next_action_due: date | None = None


class OpportunityMove(BaseModel):
    """Move a deal to another stage. BR-010: the deal must carry a próxima ação
    after the move — supply one here (updates it) or rely on the existing one."""

    stage_id: uuid.UUID
    next_action: str | None = Field(default=None, min_length=1, max_length=512)
    next_action_due: date | None = None


class OpportunityWin(BaseModel):
    """Mark a deal won (BR-013 — committed, cannot revert). A won deal without a
    sent proposal is allowed (verbal close) — the frontend surfaces the soft
    warning; the API does not block it."""

    note: str | None = Field(default=None, max_length=512)


class OpportunityLose(BaseModel):
    """Mark a deal lost. BR-011: a lost reason is mandatory."""

    lost_reason: str = Field(min_length=1, max_length=512)


class OpportunityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    company_id: uuid.UUID | None
    primary_contact_id: uuid.UUID | None
    owner_id: uuid.UUID | None
    stage_id: uuid.UUID | None
    estimated_value: int | None
    probability: int | None
    expected_close_date: date | None
    source: str | None
    description: str | None
    next_action: str | None
    next_action_due: date | None
    outcome: str
    lost_reason: str | None
    lost_at: datetime | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Won → Project handoff (F7 / BR-035..038)
# --------------------------------------------------------------------------- #
class ConversionContact(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role_title: str | None
    email: str | None


class ConversionPrefill(BaseModel):
    """Read-only prefill carried into the project spin-up wizard (BR-035).

    The project-creation endpoint (projects domain) consumes this to instantiate
    a project with zero re-entry. ``contracted_value`` is pre-filled from the
    accepted proposal when one exists, otherwise from the opportunity estimate;
    for a verbal close it is ``None`` and the user enters it manually (BR-035/C1).
    The source opportunity/proposal links are preserved read-only (BR-036).
    """

    opportunity_id: uuid.UUID
    company_id: uuid.UUID | None
    company_name: str | None
    primary_contact_id: uuid.UUID | None
    contacts: list[ConversionContact]
    accepted_proposal_id: uuid.UUID | None
    contracted_value: int | None  # EUR cents
    has_accepted_proposal: bool
    verbal_close: bool
