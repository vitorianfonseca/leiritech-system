"""Pydantic v2 schemas for tasks, transitions, blocking and dependencies (F10).

Status/priority literals mirror ``app.models.enums`` (the persisted English keys)
so invalid values are rejected with a 422 at the edge before reaching the
service. The task state machine (§1.6), dependency gating + cycle rejection
(BR-045/047), the blocked handling (BR-046) and the approval rule (BR-049/C3)
all live in ``task_service``; these schemas only shape and validate payloads.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TaskStatus = Literal["todo", "in_progress", "in_review", "blocked", "done"]
TaskPriority = Literal["low", "normal", "high", "urgent"]

# The linear-flow targets the generic transition endpoint accepts. ``blocked`` is
# excluded on purpose — blocking/unblocking has dedicated endpoints so a reason
# can be captured (BR-046).
TaskTransitionTarget = Literal["todo", "in_progress", "in_review", "done"]
# Where a task may return to when it is unblocked.
TaskUnblockTarget = Literal["todo", "in_progress"]


# --------------------------------------------------------------------------- #
# Tasks — create / update / assign
# --------------------------------------------------------------------------- #
class TaskCreate(BaseModel):
    project_id: uuid.UUID
    phase_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    primary_assignee_id: uuid.UUID | None = None
    priority: TaskPriority = "normal"
    start_date: date | None = None
    due_date: date | None = None
    estimate_hours: float | None = Field(default=None, ge=0)


class TaskUpdate(BaseModel):
    """Partial metadata update. Status changes go through the transition/block
    endpoints, so ``status`` is intentionally NOT settable here."""

    phase_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    primary_assignee_id: uuid.UUID | None = None
    priority: TaskPriority | None = None
    start_date: date | None = None
    due_date: date | None = None
    estimate_hours: float | None = Field(default=None, ge=0)


class TaskAssign(BaseModel):
    """Set (or clear, with ``null``) the primary assignee."""

    primary_assignee_id: uuid.UUID | None = None


# --------------------------------------------------------------------------- #
# Transitions / blocking
# --------------------------------------------------------------------------- #
class TaskTransition(BaseModel):
    status: TaskTransitionTarget


class TaskBlock(BaseModel):
    reason: str = Field(min_length=1, max_length=512)


class TaskUnblock(BaseModel):
    status: TaskUnblockTarget = "todo"


# --------------------------------------------------------------------------- #
# Dependencies (BR-045/047)
# --------------------------------------------------------------------------- #
class TaskDependencyCreate(BaseModel):
    depends_on_task_id: uuid.UUID


class TaskDependencyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    depends_on_task_id: uuid.UUID


# --------------------------------------------------------------------------- #
# Response
# --------------------------------------------------------------------------- #
class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    phase_id: uuid.UUID | None
    title: str
    description: str | None
    primary_assignee_id: uuid.UUID | None
    priority: str
    start_date: date | None
    due_date: date | None
    estimate_hours: float | None
    status: str
    block_reason: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
