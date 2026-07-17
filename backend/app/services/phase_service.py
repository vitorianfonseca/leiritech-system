"""Phase & milestone business logic (F10 / BR-050..052).

Every phase/milestone mutation flows through here so the phase state machine
(§1.5), the completion guard (BR-051 — a phase completes only when all its
non-archived tasks are ``done``), the milestone lifecycle (BR-052), the Membro
visibility boundary (BR-002) and the audit trail (BR-064) are enforced in one
place. Route handlers stay thin.

Forward phase transitions honour the single project-freeze seam
(``project_service.assert_child_forward_allowed``, BR-053/H4) rather than
re-deriving "is this project frozen?" here.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import Role, can_manage_project, role_at_least
from app.models.project import Milestone, Project, ProjectPhase
from app.models.user import User
from app.repositories import phases as phase_repo
from app.schemas.phases import (
    MilestoneCreate,
    MilestoneUpdate,
    PhaseCreate,
    PhaseUpdate,
)
from app.services import activity_service, notification_service, project_service

logger = structlog.get_logger("aurea.phase")

PHASE_ENTITY = "phase"
MILESTONE_ENTITY = "milestone"

# BR-054 — a phase-completion suggestion (AUTO-07) is only meaningful for a live
# project. Kept local so the phase domain does not read a service private name.
_LIVE_PROJECT_STATUSES = ("planning", "active", "on_hold")

# Phase state machine (§1.5).
_PHASE_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "not_started": ("in_progress", "blocked"),
    "in_progress": ("blocked", "completed", "not_started"),
    "blocked": ("in_progress", "not_started"),
    "completed": ("in_progress",),  # reopen
}
_PHASE_RANK = {"not_started": 0, "in_progress": 1, "completed": 2}

# Milestone state machine (§1.8 / BR-052): pending is the only non-terminal state.
_MILESTONE_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "pending": ("achieved", "missed", "cancelled"),
    "achieved": (),
    "missed": (),
    "cancelled": (),
}


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


def _phase_snapshot(phase: ProjectPhase) -> dict[str, Any]:
    return {
        "name": phase.name,
        "project_id": str(phase.project_id),
        "status": phase.status,
        "order_index": phase.order_index,
    }


def _milestone_snapshot(milestone: Milestone) -> dict[str, Any]:
    return {
        "name": milestone.name,
        "project_id": str(milestone.project_id),
        "status": milestone.status,
    }


# --------------------------------------------------------------------------- #
# Phase loads / permission (reuse the project visibility + manage seams)
# --------------------------------------------------------------------------- #
def _get_project_scoped(db: Session, user: User, project_id: uuid.UUID) -> Project:
    # Reuses BR-002 scoping (404 for a Membro outside their projects).
    return project_service.get_project_or_404(db, user, project_id)


def _require_manage(project: Project, user: User, *, code: str) -> None:
    if not can_manage_project(user, is_owner=project.manager_id == user.id):
        raise errors.forbidden(
            "Não tem permissão para gerir a estrutura deste projeto.", code=code
        )


def get_phase_or_404(db: Session, user: User, phase_id: uuid.UUID) -> ProjectPhase:
    phase = db.get(ProjectPhase, phase_id)
    if phase is None:
        raise errors.not_found("Fase não encontrada.", code="PHASE_NOT_FOUND")
    # Enforce project visibility; a Membro outside the project gets 404.
    _get_project_scoped(db, user, phase.project_id)
    return phase


def list_phases(
    db: Session, user: User, project_id: uuid.UUID
) -> list[ProjectPhase]:
    _get_project_scoped(db, user, project_id)  # visibility
    phases = phase_repo.list_phases(db, project_id)
    # Refresh derived progress (BR-050) so reads reflect current task state.
    for phase in phases:
        phase.progress = phase_repo.phase_progress(db, phase.id)
    return phases


# --------------------------------------------------------------------------- #
# Phase writes
# --------------------------------------------------------------------------- #
def create_phase(db: Session, user: User, payload: PhaseCreate) -> ProjectPhase:
    project = _get_project_scoped(db, user, payload.project_id)
    _require_manage(project, user, code="PHASE_CREATE_FORBIDDEN")
    if project.status == "archived":
        raise errors.conflict(
            "Projeto arquivado; não é possível criar fases.", code="PROJECT_ARCHIVED"
        )
    if payload.owner_id is not None and db.get(User, payload.owner_id) is None:
        raise errors.bad_request("Responsável inválido.", code="OWNER_NOT_FOUND")
    phase = ProjectPhase(
        project_id=payload.project_id,
        name=payload.name,
        description=payload.description,
        owner_id=payload.owner_id,
        start_date=payload.start_date,
        deadline=payload.deadline,
        order_index=payload.order_index,
        status="not_started",
        created_by=user.id,
    )
    db.add(phase)
    db.flush()
    activity_service.record(
        db,
        entity_type=PHASE_ENTITY,
        entity_id=phase.id,
        action="phase.created",
        actor_id=user.id,
        after=_phase_snapshot(phase),
    )
    logger.info("phase_created", phase_id=str(phase.id), actor_id=str(user.id))
    return phase


def update_phase(
    db: Session, user: User, phase_id: uuid.UUID, payload: PhaseUpdate
) -> ProjectPhase:
    phase = get_phase_or_404(db, user, phase_id)
    project = db.get(Project, phase.project_id)
    _require_manage(project, user, code="PHASE_EDIT_FORBIDDEN")
    if project.status == "archived":
        raise errors.conflict(
            "Projeto arquivado; não é possível editar fases.", code="PROJECT_ARCHIVED"
        )
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("owner_id") is not None and db.get(User, changes["owner_id"]) is None:
        raise errors.bad_request("Responsável inválido.", code="OWNER_NOT_FOUND")
    before = _phase_snapshot(phase)
    for field, value in changes.items():
        setattr(phase, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=PHASE_ENTITY,
        entity_id=phase.id,
        action="phase.updated",
        actor_id=user.id,
        before=before,
        after=_phase_snapshot(phase),
    )
    logger.info(
        "phase_updated",
        phase_id=str(phase.id),
        actor_id=str(user.id),
        fields=sorted(changes.keys()),
    )
    return phase


def _assert_phase_transition_allowed(phase: ProjectPhase, target: str) -> None:
    if target not in _PHASE_TRANSITIONS.get(phase.status, ()):
        raise errors.conflict(
            f"Transição de «{phase.status}» para «{target}» não é permitida.",
            code="PHASE_INVALID_TRANSITION",
        )


def _phase_forward(source: str, target: str) -> bool:
    if source == "blocked":
        return target == "in_progress"
    return _PHASE_RANK.get(target, -1) > _PHASE_RANK.get(source, -1)


def _assert_phase_completable(db: Session, phase: ProjectPhase) -> None:
    """BR-051: a phase completes only when all its non-archived tasks are done."""
    total, done = phase_repo.phase_task_counts(db, phase.id)
    if total > done:
        raise errors.conflict(
            "Todas as tarefas da fase têm de estar concluídas.",
            code="PHASE_TASKS_INCOMPLETE",
        )


def transition_phase(
    db: Session, user: User, phase_id: uuid.UUID, target: str
) -> ProjectPhase:
    phase = get_phase_or_404(db, user, phase_id)
    project = db.get(Project, phase.project_id)
    _require_manage(project, user, code="PHASE_TRANSITION_FORBIDDEN")
    _assert_phase_transition_allowed(phase, target)
    if _phase_forward(phase.status, target):
        project_service.assert_child_forward_allowed(project)
    if target == "completed":
        _assert_phase_completable(db, phase)
    before = _phase_snapshot(phase)
    source = phase.status
    phase.status = target
    phase.progress = phase_repo.phase_progress(db, phase.id)
    db.flush()
    activity_service.record(
        db,
        entity_type=PHASE_ENTITY,
        entity_id=phase.id,
        action=f"phase.transition.{target}",
        actor_id=user.id,
        before=before,
        after=_phase_snapshot(phase),
    )
    logger.info(
        "phase_transitioned",
        phase_id=str(phase.id),
        from_status=source,
        to_status=target,
        actor_id=str(user.id),
    )
    return phase


def complete_phase(db: Session, user: User, phase_id: uuid.UUID) -> ProjectPhase:
    """POST /phases/{id}/complete — convenience wrapper over the ``completed``
    transition (BR-051)."""
    return transition_phase(db, user, phase_id, "completed")


# --------------------------------------------------------------------------- #
# AUTO-07 — phase-completion suggestion (BR-051, event + daily reconciliation)
# --------------------------------------------------------------------------- #
def suggest_completion_if_ready(
    db: Session, phase: ProjectPhase, *, run_date=None
) -> bool:
    """If every non-archived task in ``phase`` is done but the phase is not yet
    ``completed`` (on a live project), notify the phase/project owner suggesting
    completion (AUTO-07 — never auto-completes, BR-051/C2). Idempotent per day
    via ``group_key``. Returns True when a notification was created.

    Called both as an EVENT (from the task service when a task reaches ``done``)
    and as a daily reconciliation sweep. Does NOT commit.
    """
    from datetime import UTC, datetime

    if phase.status == "completed":
        return False
    project = db.get(Project, phase.project_id)
    if project is None or project.status not in _LIVE_PROJECT_STATUSES:
        return False
    total, done = phase_repo.phase_task_counts(db, phase.id)
    if total == 0 or total != done:
        return False
    recipient = phase.owner_id or project.manager_id
    if recipient is None:
        return False
    today = run_date or datetime.now(tz=UTC).date()
    return (
        notification_service.create_notification(
            db,
            user_id=recipient,
            type="phase_completion_suggestion",
            body=(
                f"Todas as tarefas da fase «{phase.name}» estão concluídas. "
                f"Concluir a fase?"
            ),
            entity_type="phase",
            entity_id=phase.id,
            group_key=f"AUTO-07:{phase.id}:{today.isoformat()}",
        )
        is not None
    )


# --------------------------------------------------------------------------- #
# Milestones (BR-052)
# --------------------------------------------------------------------------- #
def get_milestone_or_404(db: Session, user: User, milestone_id: uuid.UUID) -> Milestone:
    milestone = db.get(Milestone, milestone_id)
    if milestone is None:
        raise errors.not_found("Marco não encontrado.", code="MILESTONE_NOT_FOUND")
    _get_project_scoped(db, user, milestone.project_id)
    return milestone


def list_milestones(
    db: Session, user: User, project_id: uuid.UUID
) -> list[Milestone]:
    _get_project_scoped(db, user, project_id)  # visibility
    return phase_repo.list_milestones(db, project_id)


def create_milestone(
    db: Session, user: User, payload: MilestoneCreate
) -> Milestone:
    project = _get_project_scoped(db, user, payload.project_id)
    _require_manage(project, user, code="MILESTONE_CREATE_FORBIDDEN")
    if project.status == "archived":
        raise errors.conflict(
            "Projeto arquivado; não é possível criar marcos.", code="PROJECT_ARCHIVED"
        )
    if payload.phase_id is not None:
        phase = db.get(ProjectPhase, payload.phase_id)
        if phase is None or phase.project_id != project.id:
            raise errors.bad_request(
                "Fase inválida para este projeto.", code="PHASE_NOT_FOUND"
            )
    milestone = Milestone(
        project_id=payload.project_id,
        phase_id=payload.phase_id,
        name=payload.name,
        description=payload.description,
        due_date=payload.due_date,
        owner_id=payload.owner_id,
        status="pending",
        created_by=user.id,
    )
    db.add(milestone)
    db.flush()
    activity_service.record(
        db,
        entity_type=MILESTONE_ENTITY,
        entity_id=milestone.id,
        action="milestone.created",
        actor_id=user.id,
        after=_milestone_snapshot(milestone),
    )
    logger.info(
        "milestone_created", milestone_id=str(milestone.id), actor_id=str(user.id)
    )
    return milestone


def update_milestone(
    db: Session, user: User, milestone_id: uuid.UUID, payload: MilestoneUpdate
) -> Milestone:
    milestone = get_milestone_or_404(db, user, milestone_id)
    project = db.get(Project, milestone.project_id)
    _require_manage(project, user, code="MILESTONE_EDIT_FORBIDDEN")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("phase_id") is not None:
        phase = db.get(ProjectPhase, changes["phase_id"])
        if phase is None or phase.project_id != milestone.project_id:
            raise errors.bad_request(
                "Fase inválida para este projeto.", code="PHASE_NOT_FOUND"
            )
    before = _milestone_snapshot(milestone)
    for field, value in changes.items():
        setattr(milestone, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=MILESTONE_ENTITY,
        entity_id=milestone.id,
        action="milestone.updated",
        actor_id=user.id,
        before=before,
        after=_milestone_snapshot(milestone),
    )
    logger.info(
        "milestone_updated", milestone_id=str(milestone.id), actor_id=str(user.id)
    )
    return milestone


def transition_milestone(
    db: Session, user: User, milestone_id: uuid.UUID, target: str
) -> Milestone:
    milestone = get_milestone_or_404(db, user, milestone_id)
    project = db.get(Project, milestone.project_id)
    _require_manage(project, user, code="MILESTONE_TRANSITION_FORBIDDEN")
    if target not in _MILESTONE_TRANSITIONS.get(milestone.status, ()):
        raise errors.conflict(
            f"Transição de «{milestone.status}» para «{target}» não é permitida.",
            code="MILESTONE_INVALID_TRANSITION",
        )
    before = _milestone_snapshot(milestone)
    milestone.status = target
    db.flush()
    activity_service.record(
        db,
        entity_type=MILESTONE_ENTITY,
        entity_id=milestone.id,
        action=f"milestone.transition.{target}",
        actor_id=user.id,
        before=before,
        after=_milestone_snapshot(milestone),
    )
    logger.info(
        "milestone_transitioned",
        milestone_id=str(milestone.id),
        to_status=target,
        actor_id=str(user.id),
    )
    return milestone


def complete_milestone(
    db: Session, user: User, milestone_id: uuid.UUID
) -> Milestone:
    """POST /milestones/{id}/complete — mark the milestone achieved (BR-052)."""
    return transition_milestone(db, user, milestone_id, "achieved")
