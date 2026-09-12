"""Pydantic v2 schemas for projects, health, cascade, and templates (F8/F9).

Money is integer EUR cents. Status/health literals mirror ``app.models.enums``
(the persisted English keys) so invalid values are rejected with a 422 at the
edge before reaching the service layer. The lifecycle state machine (§1.3), the
health publish rules (BR-030/031), the cascade freeze (BR-053/054) and template
instantiation (F9) live in ``project_service`` where they have database context;
these schemas only shape and validate the payloads.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ProjectStatus = Literal[
    "planning", "active", "on_hold", "completed", "cancelled", "archived"
]
ProjectHealth = Literal["healthy", "attention", "at_risk"]


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
class ProjectCreate(BaseModel):
    """Create a project directly in ``planning``. Spin-up from a won opportunity
    or a template use the dedicated ``/from-opportunity`` / ``/from-template``
    endpoints."""

    name: str = Field(min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    description: str | None = None
    start_date: date | None = None
    deadline: date | None = None
    contracted_value: int | None = Field(default=None, ge=0)  # EUR cents
    hours_budget: float | None = Field(default=None, ge=0)
    internal_cost_rate: int | None = Field(default=None, ge=0)  # cents/hour


class ProjectUpdate(BaseModel):
    """Partial update of metadata. Lifecycle transitions (start/pause/resume/
    complete/cancel/archive) and health publishing have dedicated endpoints and
    are NOT settable here."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    description: str | None = None
    start_date: date | None = None
    deadline: date | None = None
    contracted_value: int | None = Field(default=None, ge=0)
    hours_budget: float | None = Field(default=None, ge=0)
    internal_cost_rate: int | None = Field(default=None, ge=0)


class ProjectStateChange(BaseModel):
    """Body for a lifecycle transition. ``reason`` is required by the service for
    pause and cancel (BR-053, §1.3); other transitions ignore it."""

    reason: str | None = Field(default=None, max_length=512)


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    company_id: uuid.UUID | None
    # The client's name, not just its id: the project header showed a building
    # icon with nothing beside it, and every list had to guess.
    company_name: str | None = None
    opportunity_id: uuid.UUID | None
    accepted_proposal_id: uuid.UUID | None
    manager_id: uuid.UUID | None
    manager_name: str | None = None
    description: str | None
    start_date: date | None
    deadline: date | None
    contracted_value: int | None  # EUR cents
    hours_budget: float | None
    internal_cost_rate: int | None
    status: str
    suggested_health: str | None
    published_health: str | None
    health_reason: str | None
    health_published_at: datetime | None
    health_published_by: uuid.UUID | None
    status_reason: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Rollups the list view renders as columns. Computed in bulk by the list
    # route; left at their defaults elsewhere, where the caller already has
    # the members and phases to hand.
    team_count: int = 0
    progress: int = 0
    hours_used: float = 0.0


# --------------------------------------------------------------------------- #
# Health (BR-030..032)
# --------------------------------------------------------------------------- #
class ProjectHealthResponse(BaseModel):
    """Suggested (system-derived) vs published (human-owned) health (BR-030)."""

    model_config = ConfigDict(from_attributes=True)

    project_id: uuid.UUID = Field(validation_alias="id")
    suggested_health: str | None
    published_health: str | None
    health_reason: str | None
    health_published_at: datetime | None
    health_published_by: uuid.UUID | None


class ProjectHealthPublish(BaseModel):
    """Publish a human-owned health (BR-030). When ``health`` differs from the
    current ``suggested_health`` an override ``reason`` is required (BR-031);
    the service enforces that with a 422."""

    health: ProjectHealth
    reason: str | None = Field(default=None, max_length=512)


# --------------------------------------------------------------------------- #
# Members
# --------------------------------------------------------------------------- #
class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID
    role_in_project: str | None = Field(default=None, max_length=128)


class ProjectMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    # The id alone forced the UI to print a raw UUID where a person's name
    # belongs. Resolving it here rather than in the client keeps it correct
    # for a Membro too, whose own /users view is scoped to their own row.
    user_name: str | None = None
    role_in_project: str | None


# --------------------------------------------------------------------------- #
# Template instantiation (F9)
# --------------------------------------------------------------------------- #
class ProjectFromTemplate(BaseModel):
    """Instantiate a project (and its phases/tasks) from a template (F9)."""

    template_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    start_date: date | None = None
    contracted_value: int | None = Field(default=None, ge=0)


class ProjectFromOpportunity(BaseModel):
    """Spin up a project from a won opportunity (F7/BR-035..038). The commercial
    prefill (company, contracted value, source links) is read from
    ``opportunity_service.convert_opportunity``; anything supplied here overrides
    the prefill. An optional template instantiates phases/tasks."""

    opportunity_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    template_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    start_date: date | None = None
    deadline: date | None = None
    contracted_value: int | None = Field(default=None, ge=0)


class TemplateTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    order_index: int = Field(default=0, ge=0)
    role_responsible: str | None = Field(default=None, max_length=128)
    estimate_hours: float | None = Field(default=None, ge=0)


class TemplatePhaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    order_index: int = Field(default=0, ge=0)
    expected_duration: int | None = Field(default=None, ge=0)  # days
    tasks: list[TemplateTaskCreate] = Field(default_factory=list)


class ProjectTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    expected_duration: int | None = Field(default=None, ge=0)  # days
    phases: list[TemplatePhaseCreate] = Field(default_factory=list)


class ProjectTemplateUpdate(BaseModel):
    """Audit C10 — mirrors proposal_template_service's replace-on-save
    pattern: ``phases`` (when provided) REPLACES the entire phases/tasks
    tree, matching how the frontend's phase/task editor works (edit the
    whole structure, save once) rather than granular per-row endpoints."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    expected_duration: int | None = Field(default=None, ge=0)
    phases: list[TemplatePhaseCreate] | None = None


class TemplateTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    order_index: int
    role_responsible: str | None
    estimate_hours: float | None


class TemplatePhaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    order_index: int
    expected_duration: int | None
    tasks: list[TemplateTaskResponse] = Field(default_factory=list)


class ProjectTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    expected_duration: int | None
    phases: list[TemplatePhaseResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
