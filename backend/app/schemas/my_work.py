"""My Work daily hub (F3/F17) response models — the `/my-work` contract.

These mirror ``frontend/src/lib/api/my-work-types.ts`` field-for-field so the
integration phase swaps the frontend mock for a real fetch with ZERO shape
changes. The wire format is camelCase (the TS contract). Everything is scoped to
the authenticated caller (BR-002 — own scope only); the review queue is gated to
Gestor+/Admin (BR C3). Money/duration are integers; enum/state values are stable
English keys.

``activeTimer`` is an ADDITIVE field (not in the current TS contract, so TS
consumers ignore it — no type change required for the integration swap); the
canonical active-timer source remains ``GET /time/active``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# The TS contract's TaskStatus has no "blocked" — blocked is surfaced via the
# orthogonal ``blocked`` flag while status projects to in_progress.
TaskStatus = Literal["todo", "in_progress", "in_review", "done"]
TaskPriority = Literal["low", "medium", "high", "urgent"]
ProjectHealth = Literal["healthy", "attention", "at_risk"]
MentionEntityType = Literal["company", "opportunity", "project", "task"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class MyTask(_CamelModel):
    id: str
    title: str
    project_id: str
    project_name: str
    status: TaskStatus
    priority: TaskPriority
    due_date: str | None = None
    blocked: bool
    blocked_reason: str | None = None
    comment_count: int


class MyMeeting(_CamelModel):
    id: str
    title: str
    starts_at: str
    ends_at: str
    location: str | None = None
    attendees: int


class MyMention(_CamelModel):
    id: str
    comment_id: str
    entity_type: MentionEntityType
    entity_id: str
    entity_label: str
    author_name: str
    excerpt: str
    created_at: str


class MyReviewRequest(_CamelModel):
    id: str
    task_id: str
    task_title: str
    project_name: str
    requested_by_name: str
    requested_at: str


class MyProject(_CamelModel):
    id: str
    name: str
    client_name: str
    health: ProjectHealth
    progress: int
    open_tasks: int


class MyTimeEntry(_CamelModel):
    id: str
    task_id: str | None = None
    task_title: str
    project_name: str
    date: str
    duration_ms: int


class MyActiveTimer(_CamelModel):
    """Additive (not in the TS contract) — the caller's running timer, if any."""

    id: str
    task_id: str
    task_title: str
    project_name: str
    started_at: str


class MyWork(_CamelModel):
    today: list[MyTask]
    overdue: list[MyTask]
    this_week: list[MyTask]
    no_date: list[MyTask]
    meetings: list[MyMeeting]
    mentions: list[MyMention]
    review_requests: list[MyReviewRequest]
    projects: list[MyProject]
    recent_time_entries: list[MyTimeEntry]
    active_timer: MyActiveTimer | None = None
