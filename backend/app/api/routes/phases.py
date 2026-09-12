"""Phase & milestone routes (F10 / BR-050..052).

Two routers are exported: ``router`` (phases, mounted at ``/phases``) and
``milestones_router`` (mounted at ``/milestones``). Viewing is scoped for a
Membro (BR-002); creating/editing/transitioning project structure requires
project-management rights (Admin any, Gestor for a project they own). The phase
state machine, the "all tasks done" completion guard (BR-051) and the milestone
lifecycle (BR-052) live in ``phase_service``; these handlers only wire HTTP.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.phases import (
    MilestoneCreate,
    MilestoneResponse,
    MilestoneTransition,
    MilestoneUpdate,
    PhaseCreate,
    PhaseResponse,
    PhaseTransition,
    PhaseUpdate,
)
from app.repositories import projects as project_repo
from app.services import phase_service

router = APIRouter()
milestones_router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


# --------------------------------------------------------------------------- #
# Phases
# --------------------------------------------------------------------------- #
def _phase_response(phase, counts: dict) -> PhaseResponse:
    """Attach the phase's task counts. `counts` is fetched once per request by
    the caller, so a project's phases cost one query rather than one each."""
    resp = PhaseResponse.model_validate(phase)
    total, done = counts.get(phase.id, (0, 0))
    resp.tasks_total = total
    resp.tasks_done = done
    return resp


@router.get("", response_model=list[PhaseResponse])
def list_phases(
    project_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> list[PhaseResponse]:
    phases = phase_service.list_phases(db, user, project_id)
    counts = project_repo.phase_task_counts(db, project_id)
    return [_phase_response(p, counts) for p in phases]


@router.post("", response_model=PhaseResponse, status_code=status.HTTP_201_CREATED)
def create_phase(
    payload: PhaseCreate,
    user: RequireGestor,
    db: DbSession,
) -> PhaseResponse:
    phase = phase_service.create_phase(db, user, payload)
    return _phase_response(phase, project_repo.phase_task_counts(db, phase.project_id))


@router.get("/{phase_id}", response_model=PhaseResponse)
def get_phase(phase_id: uuid.UUID, user: CurrentUser, db: DbSession) -> PhaseResponse:
    phase = phase_service.get_phase_or_404(db, user, phase_id)
    return _phase_response(phase, project_repo.phase_task_counts(db, phase.project_id))


@router.patch("/{phase_id}", response_model=PhaseResponse)
def update_phase(
    phase_id: uuid.UUID,
    payload: PhaseUpdate,
    user: RequireGestor,
    db: DbSession,
) -> PhaseResponse:
    phase = phase_service.update_phase(db, user, phase_id, payload)
    return _phase_response(phase, project_repo.phase_task_counts(db, phase.project_id))


@router.post("/{phase_id}/transition", response_model=PhaseResponse)
def transition_phase(
    phase_id: uuid.UUID,
    payload: PhaseTransition,
    user: RequireGestor,
    db: DbSession,
) -> PhaseResponse:
    phase = phase_service.transition_phase(db, user, phase_id, payload.status)
    return _phase_response(phase, project_repo.phase_task_counts(db, phase.project_id))


@router.post("/{phase_id}/complete", response_model=PhaseResponse)
def complete_phase(
    phase_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> PhaseResponse:
    phase = phase_service.complete_phase(db, user, phase_id)
    return _phase_response(phase, project_repo.phase_task_counts(db, phase.project_id))


# --------------------------------------------------------------------------- #
# Milestones (BR-052)
# --------------------------------------------------------------------------- #
@milestones_router.get("", response_model=list[MilestoneResponse])
def list_milestones(
    project_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> list[MilestoneResponse]:
    milestones = phase_service.list_milestones(db, user, project_id)
    return [MilestoneResponse.model_validate(m) for m in milestones]


@milestones_router.post(
    "", response_model=MilestoneResponse, status_code=status.HTTP_201_CREATED
)
def create_milestone(
    payload: MilestoneCreate,
    user: RequireGestor,
    db: DbSession,
) -> MilestoneResponse:
    milestone = phase_service.create_milestone(db, user, payload)
    return MilestoneResponse.model_validate(milestone)


@milestones_router.get("/{milestone_id}", response_model=MilestoneResponse)
def get_milestone(
    milestone_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> MilestoneResponse:
    milestone = phase_service.get_milestone_or_404(db, user, milestone_id)
    return MilestoneResponse.model_validate(milestone)


@milestones_router.patch("/{milestone_id}", response_model=MilestoneResponse)
def update_milestone(
    milestone_id: uuid.UUID,
    payload: MilestoneUpdate,
    user: RequireGestor,
    db: DbSession,
) -> MilestoneResponse:
    milestone = phase_service.update_milestone(db, user, milestone_id, payload)
    return MilestoneResponse.model_validate(milestone)


@milestones_router.post("/{milestone_id}/transition", response_model=MilestoneResponse)
def transition_milestone(
    milestone_id: uuid.UUID,
    payload: MilestoneTransition,
    user: RequireGestor,
    db: DbSession,
) -> MilestoneResponse:
    milestone = phase_service.transition_milestone(
        db, user, milestone_id, payload.status
    )
    return MilestoneResponse.model_validate(milestone)


@milestones_router.post("/{milestone_id}/complete", response_model=MilestoneResponse)
def complete_milestone(
    milestone_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> MilestoneResponse:
    milestone = phase_service.complete_milestone(db, user, milestone_id)
    return MilestoneResponse.model_validate(milestone)
