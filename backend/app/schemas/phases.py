"""Pydantic v2 schemas for phases and milestones (F10 / BR-050..052).

Status literals mirror ``app.models.enums``. The phase state machine, the
"all tasks done" completion guard (BR-051) and the freeze seam live in
``phase_service``; these schemas only shape and validate payloads.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PhaseStatus = Literal["not_started", "in_progress", "blocked", "completed"]
PhaseTransitionTarget = Literal["not_started", "in_progress", "blocked", "completed"]
MilestoneStatus = Literal["pending", "achieved", "missed", "cancelled"]
MilestoneTransitionTarget = Literal["achieved", "missed", "cancelled"]


# --------------------------------------------------------------------------- #
# Phases
# --------------------------------------------------------------------------- #
class PhaseCreate(BaseModel):
    project_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    owner_id: uuid.UUID | None = None
    start_date: date | None = None
    deadline: date | None = None
    order_index: int = Field(default=0, ge=0)


class PhaseUpdate(BaseModel):
    """Partial metadata update. Status changes use the transition/complete
    endpoints; ``status`` is intentionally NOT settable here."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    owner_id: uuid.UUID | None = None
    start_date: date | None = None
    deadline: date | None = None
    order_index: int | None = Field(default=None, ge=0)


class PhaseTransition(BaseModel):
    status: PhaseTransitionTarget


class PhaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    owner_id: uuid.UUID | None
    start_date: date | None
    deadline: date | None
    order_index: int
    progress: int
    # Counts, not just a percentage. The UI showed "0/0 tasks" on every phase
    # because it had no per-phase totals to show and defaulted them to zero.
    tasks_total: int = 0
    tasks_done: int = 0
    final_milestone_id: uuid.UUID | None
    status: str
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Milestones (BR-052)
# --------------------------------------------------------------------------- #
class MilestoneCreate(BaseModel):
    project_id: uuid.UUID
    phase_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    due_date: date | None = None
    owner_id: uuid.UUID | None = None


class MilestoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    due_date: date | None = None
    owner_id: uuid.UUID | None = None
    phase_id: uuid.UUID | None = None


class MilestoneTransition(BaseModel):
    status: MilestoneTransitionTarget


class MilestoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    phase_id: uuid.UUID | None
    name: str
    description: str | None
    due_date: date | None
    owner_id: uuid.UUID | None
    status: str
    created_at: datetime
    updated_at: datetime
