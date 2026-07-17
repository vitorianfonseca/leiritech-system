"""Task business logic (F10 — state machine, dependency gating, approval rule).

Every task mutation flows through here so the state machine (WORKFLOW_SPEC §1.6),
dependency gating + cycle rejection (BR-045/047), the blocked handling (BR-046),
the approval rule (BR-049/C3 — ``in_review`` → ``done`` is Gestor+/Admin only),
the Membro visibility/edit boundary (BR-002/H7) and the audit trail (BR-064) are
enforced in exactly one place. Route handlers stay thin.

The project-freeze rule (BR-053/H4 — a frozen project rejects forward child
transitions) is NOT re-implemented here: this service calls the single seam
``project_service.assert_child_forward_allowed`` so the rule lives in one place.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import (
    Role,
    can_approve_task,
    can_edit_task,
    can_transition_task,
    role_at_least,
)
from app.models.project import Project
from app.models.task import Task, TaskDependency
from app.models.user import User
from app.repositories import tasks as task_repo
from app.schemas.tasks import (
    TaskAssign,
    TaskBlock,
    TaskCreate,
    TaskDependencyCreate,
    TaskUnblock,
    TaskUpdate,
)
from app.services import activity_service, notification_service, project_service

logger = structlog.get_logger("aurea.task")

ENTITY_TYPE = "task"

# Task state machine (§1.6). Each source status lists its legal targets.
# ``blocked`` is reached/left only through the block/unblock endpoints.
_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "todo": ("in_progress", "blocked"),
    "in_progress": ("in_review", "todo", "blocked"),
    "in_review": ("done", "in_progress", "blocked"),
    "blocked": ("todo", "in_progress", "in_review"),
    "done": ("in_progress",),  # reopen
}

# Rank used to tell forward moves (freeze-guarded) from backward ones.
_RANK = {"todo": 0, "in_progress": 1, "in_review": 2, "done": 3}

# Targets that require the task's blocking dependencies to be met (BR-045):
# starting work and completing.
_DEPENDENCY_GATED_TARGETS = ("in_progress", "done")

_SNAPSHOT_FIELDS = (
    "title",
    "project_id",
    "phase_id",
    "primary_assignee_id",
    "priority",
    "status",
    "block_reason",
)


def _snapshot(task: Task) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in _SNAPSHOT_FIELDS:
        value = getattr(task, field)
        if isinstance(value, uuid.UUID):
            value = str(value)
        out[field] = value
    return out


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


# --------------------------------------------------------------------------- #
# Loads / scope (BR-002 / H7)
# --------------------------------------------------------------------------- #
def _load_project(db: Session, task: Task) -> Project:
    project = db.get(Project, task.project_id)
    if project is None:  # pragma: no cover - FK guarantees presence
        raise errors.not_found("Projeto não encontrado.", code="PROJECT_NOT_FOUND")
    return project


def _membership(db: Session, project: Project, user: User) -> tuple[bool, bool]:
    """``(is_member, is_owner)`` of the task's project for the current user."""
    from app.repositories import projects as project_repo

    is_owner = project.manager_id == user.id
    is_member = project_repo.is_member(db, project.id, user.id)
    return is_member, is_owner


def get_task_or_404(db: Session, user: User, task_id: uuid.UUID) -> Task:
    """Load a task, enforcing the Membro visibility boundary (BR-002).

    A Membro may see a task only when it is assigned to them, or lives in a
    project they manage or belong to; otherwise 404 (not 403) to prevent
    enumeration.
    """
    task = db.get(Task, task_id)
    if task is None:
        raise errors.not_found("Tarefa não encontrada.", code="TASK_NOT_FOUND")
    if _is_membro(user):
        project = _load_project(db, task)
        is_member, is_owner = _membership(db, project, user)
        is_assignee = task.primary_assignee_id == user.id or task_repo.is_assignee(
            db, task.id, user.id
        )
        if not (is_member or is_owner or is_assignee):
            raise errors.not_found("Tarefa não encontrada.", code="TASK_NOT_FOUND")
    return task


def list_tasks(
    db: Session,
    user: User,
    *,
    project_id: uuid.UUID | None,
    phase_id: uuid.UUID | None,
    assignee_id: uuid.UUID | None,
    status: str | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Task], int]:
    scope_filter = (
        task_repo.membro_task_filter(user.id) if _is_membro(user) else None
    )
    return task_repo.list_tasks(
        db,
        scope_filter=scope_filter,
        project_id=project_id,
        phase_id=phase_id,
        assignee_id=assignee_id,
        status=status,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )


# --------------------------------------------------------------------------- #
# Permission helpers
# --------------------------------------------------------------------------- #
def _require_edit(db: Session, project: Project, user: User, *, code: str) -> None:
    is_member, is_owner = _membership(db, project, user)
    if not can_edit_task(user, is_member=is_member, is_owner=is_owner):
        raise errors.forbidden(
            "Não tem permissão para editar tarefas neste projeto.", code=code
        )


def _assert_project_editable(project: Project) -> None:
    if project.status == "archived":
        raise errors.conflict(
            "Projeto arquivado; não é possível alterar as suas tarefas.",
            code="PROJECT_ARCHIVED",
        )


def _validate_assignee(db: Session, assignee_id: uuid.UUID | None) -> None:
    if assignee_id is not None and db.get(User, assignee_id) is None:
        raise errors.bad_request("Responsável inválido.", code="ASSIGNEE_NOT_FOUND")


# --------------------------------------------------------------------------- #
# Writes — create / update / assign
# --------------------------------------------------------------------------- #
def create_task(db: Session, user: User, payload: TaskCreate) -> Task:
    project = db.get(Project, payload.project_id)
    if project is None:
        raise errors.bad_request("Projeto inválido.", code="PROJECT_NOT_FOUND")
    # A Membro must not be able to probe a project they cannot see (BR-002).
    if _is_membro(user):
        is_member, is_owner = _membership(db, project, user)
        if not (is_member or is_owner):
            raise errors.not_found("Projeto não encontrado.", code="PROJECT_NOT_FOUND")
    _require_edit(db, project, user, code="TASK_CREATE_FORBIDDEN")
    _assert_project_editable(project)
    _validate_assignee(db, payload.primary_assignee_id)
    if payload.phase_id is not None:
        _validate_phase(db, project.id, payload.phase_id)

    task = Task(
        project_id=payload.project_id,
        phase_id=payload.phase_id,
        title=payload.title,
        description=payload.description,
        primary_assignee_id=payload.primary_assignee_id,
        priority=payload.priority,
        start_date=payload.start_date,
        due_date=payload.due_date,
        estimate_hours=payload.estimate_hours,
        status="todo",
        created_by=user.id,
    )
    db.add(task)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
        action="task.created",
        actor_id=user.id,
        after=_snapshot(task),
    )
    # Event notification (F15): tell an assignee (other than the actor) a task
    # was assigned to them.
    _notify_assignee(db, task, actor_id=user.id)
    logger.info("task_created", task_id=str(task.id), actor_id=str(user.id))
    return task


def _notify_assignee(db: Session, task: Task, *, actor_id: uuid.UUID) -> None:
    """Notify a task's primary assignee (F15 'task assigned to you'), unless the
    assignee is the actor or the task is unassigned."""
    assignee = task.primary_assignee_id
    if assignee is None or assignee == actor_id:
        return
    notification_service.create_notification(
        db,
        user_id=assignee,
        type="task_assigned",
        body=f"Foi-lhe atribuída a tarefa «{task.title}».",
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
    )


def _validate_phase(db: Session, project_id: uuid.UUID, phase_id: uuid.UUID) -> None:
    from app.models.project import ProjectPhase

    phase = db.get(ProjectPhase, phase_id)
    if phase is None or phase.project_id != project_id:
        raise errors.bad_request(
            "Fase inválida para este projeto.", code="PHASE_NOT_FOUND"
        )


def update_task(
    db: Session, user: User, task_id: uuid.UUID, payload: TaskUpdate
) -> Task:
    task = get_task_or_404(db, user, task_id)
    project = _load_project(db, task)
    _require_edit(db, project, user, code="TASK_EDIT_FORBIDDEN")
    _assert_project_editable(project)
    changes = payload.model_dump(exclude_unset=True)
    if "primary_assignee_id" in changes:
        _validate_assignee(db, changes["primary_assignee_id"])
    if changes.get("phase_id") is not None:
        _validate_phase(db, task.project_id, changes["phase_id"])
    before = _snapshot(task)
    for field, value in changes.items():
        setattr(task, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
        action="task.updated",
        actor_id=user.id,
        before=before,
        after=_snapshot(task),
    )
    logger.info(
        "task_updated",
        task_id=str(task.id),
        actor_id=str(user.id),
        fields=sorted(changes.keys()),
    )
    return task


def assign_task(
    db: Session, user: User, task_id: uuid.UUID, payload: TaskAssign
) -> Task:
    task = get_task_or_404(db, user, task_id)
    project = _load_project(db, task)
    _require_edit(db, project, user, code="TASK_ASSIGN_FORBIDDEN")
    _assert_project_editable(project)
    _validate_assignee(db, payload.primary_assignee_id)
    before = _snapshot(task)
    task.primary_assignee_id = payload.primary_assignee_id
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
        action="task.assigned",
        actor_id=user.id,
        before=before,
        after=_snapshot(task),
    )
    _notify_assignee(db, task, actor_id=user.id)  # F15 'task assigned to you'
    logger.info(
        "task_assigned",
        task_id=str(task.id),
        assignee_id=str(payload.primary_assignee_id)
        if payload.primary_assignee_id
        else None,
        actor_id=str(user.id),
    )
    return task


# --------------------------------------------------------------------------- #
# Transitions (§1.6 state machine)
# --------------------------------------------------------------------------- #
def _assert_transition_allowed(task: Task, target: str) -> None:
    if target not in _TRANSITIONS.get(task.status, ()):  # illegal → 409
        raise errors.conflict(
            f"Transição de «{task.status}» para «{target}» não é permitida.",
            code="TASK_INVALID_TRANSITION",
        )


def _is_forward(source: str, target: str) -> bool:
    """A move is forward (freeze-guarded, BR-053/H4) when it advances the linear
    flow, including resuming from ``blocked`` into an active working state."""
    if source == "blocked":
        return target in ("in_progress", "in_review")
    return _RANK.get(target, -1) > _RANK.get(source, -1)


def _assert_dependencies_met(db: Session, task: Task, *, code: str) -> None:
    unmet = task_repo.unmet_dependency_ids(db, task.id)
    if unmet:
        raise errors.ApiError(
            status_code=409,
            code=code,
            message="A tarefa tem dependências por concluir.",
            details={"unmet_dependencies": [str(t) for t in unmet]},
        )


def _permission_for_transition(
    db: Session, task: Task, project: Project, user: User, target: str
) -> None:
    is_member, is_owner = _membership(db, project, user)
    is_assignee = task.primary_assignee_id == user.id or task_repo.is_assignee(
        db, task.id, user.id
    )
    if target == "done":
        # Approval (in_review → done) is Gestor+/Admin only (BR-049/C3); the
        # project manager qualifies as the approving Gestor.
        if not can_approve_task(user, is_project_manager=is_owner):
            raise errors.forbidden(
                "Só um Gestor ou Administrador pode aprovar a conclusão.",
                code="TASK_APPROVAL_FORBIDDEN",
            )
        return
    if not can_transition_task(
        user, is_assignee=is_assignee or is_owner, is_member=is_member or is_owner
    ):
        raise errors.forbidden(
            "Não tem permissão para transitar esta tarefa.",
            code="TASK_TRANSITION_FORBIDDEN",
        )


def transition_task(
    db: Session, user: User, task_id: uuid.UUID, target: str
) -> Task:
    """Single entry point for the linear task flow (§1.6). Validates the
    transition against the state machine (409 on illegal), enforces the approval
    rule for ``done`` (BR-049), gates forward moves on the project freeze seam
    (BR-053) and on dependency completion (BR-045)."""
    if target == "blocked":
        raise errors.bad_request(
            "Use o endpoint de bloqueio para marcar a tarefa como bloqueada.",
            code="TASK_USE_BLOCK_ENDPOINT",
        )
    task = get_task_or_404(db, user, task_id)
    project = _load_project(db, task)
    _assert_transition_allowed(task, target)
    _permission_for_transition(db, task, project, user, target)

    if _is_forward(task.status, target):
        project_service.assert_child_forward_allowed(project)
    if target in _DEPENDENCY_GATED_TARGETS:
        _assert_dependencies_met(db, task, code="TASK_DEPENDENCIES_UNMET")

    before = _snapshot(task)
    source = task.status
    task.status = target
    if source == "blocked":
        task.block_reason = None
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
        action=f"task.transition.{target}",
        actor_id=user.id,
        before=before,
        after=_snapshot(task),
    )
    logger.info(
        "task_transitioned",
        task_id=str(task.id),
        from_status=source,
        to_status=target,
        actor_id=str(user.id),
    )
    # AUTO-07 event (BR-051): completing the last open task in a phase suggests
    # phase completion. Single reusable call into the phase domain; the phase
    # service owns the "is the phase ready?" rule and the notification.
    if source != "done" and target == "done" and task.phase_id is not None:
        from app.models.project import ProjectPhase
        from app.services import phase_service

        phase = db.get(ProjectPhase, task.phase_id)
        if phase is not None:
            phase_service.suggest_completion_if_ready(db, phase)
    return task


# --------------------------------------------------------------------------- #
# Blocking (BR-046)
# --------------------------------------------------------------------------- #
def block_task(
    db: Session, user: User, task_id: uuid.UUID, payload: TaskBlock
) -> Task:
    task = get_task_or_404(db, user, task_id)
    project = _load_project(db, task)
    _permission_for_transition(db, task, project, user, "blocked")
    if task.status == "blocked":
        raise errors.conflict("A tarefa já está bloqueada.", code="TASK_ALREADY_BLOCKED")
    if task.status == "done":
        raise errors.conflict(
            "Uma tarefa concluída não pode ser bloqueada.", code="TASK_INVALID_TRANSITION"
        )
    before = _snapshot(task)
    task.status = "blocked"
    task.block_reason = payload.reason
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
        action="task.blocked",
        actor_id=user.id,
        before=before,
        after=_snapshot(task),
    )
    logger.info("task_blocked", task_id=str(task.id), actor_id=str(user.id))
    return task


def unblock_task(
    db: Session, user: User, task_id: uuid.UUID, payload: TaskUnblock
) -> Task:
    task = get_task_or_404(db, user, task_id)
    project = _load_project(db, task)
    _permission_for_transition(db, task, project, user, payload.status)
    if task.status != "blocked":
        raise errors.conflict(
            "A tarefa não está bloqueada.", code="TASK_NOT_BLOCKED"
        )
    # Resuming into an active working state is a forward move → freeze-guarded.
    if payload.status == "in_progress":
        project_service.assert_child_forward_allowed(project)
        _assert_dependencies_met(db, task, code="TASK_DEPENDENCIES_UNMET")
    before = _snapshot(task)
    task.status = payload.status
    task.block_reason = None
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
        action="task.unblocked",
        actor_id=user.id,
        before=before,
        after=_snapshot(task),
    )
    logger.info(
        "task_unblocked",
        task_id=str(task.id),
        to_status=payload.status,
        actor_id=str(user.id),
    )
    return task


# --------------------------------------------------------------------------- #
# Dependencies (BR-045 / BR-047)
# --------------------------------------------------------------------------- #
def list_dependencies(
    db: Session, user: User, task_id: uuid.UUID
) -> list[TaskDependency]:
    get_task_or_404(db, user, task_id)  # visibility
    return task_repo.list_dependencies(db, task_id)


def _would_create_cycle(
    edges: list[tuple[uuid.UUID, uuid.UUID]],
    new_task: uuid.UUID,
    new_dep: uuid.UUID,
) -> bool:
    """Adding ``new_task -> new_dep`` (task depends on dep) creates a cycle iff
    ``new_dep`` already reaches ``new_task`` through existing edges (BR-047)."""
    adjacency: dict[uuid.UUID, list[uuid.UUID]] = {}
    for src, dst in edges:
        adjacency.setdefault(src, []).append(dst)
    stack = [new_dep]
    seen: set[uuid.UUID] = set()
    while stack:
        node = stack.pop()
        if node == new_task:
            return True
        if node in seen:
            continue
        seen.add(node)
        stack.extend(adjacency.get(node, []))
    return False


def add_dependency(
    db: Session, user: User, task_id: uuid.UUID, payload: TaskDependencyCreate
) -> TaskDependency:
    task = get_task_or_404(db, user, task_id)
    project = _load_project(db, task)
    _require_edit(db, project, user, code="TASK_DEPENDENCY_FORBIDDEN")
    _assert_project_editable(project)

    dep_id = payload.depends_on_task_id
    if dep_id == task.id:
        raise errors.bad_request(
            "Uma tarefa não pode depender de si própria.",
            code="TASK_DEPENDENCY_SELF",
        )
    dep_task = db.get(Task, dep_id)
    if dep_task is None:
        raise errors.bad_request(
            "Tarefa de dependência inválida.", code="TASK_DEPENDENCY_NOT_FOUND"
        )
    if dep_task.project_id != task.project_id:
        raise errors.conflict(
            "As dependências têm de pertencer ao mesmo projeto.",
            code="TASK_DEPENDENCY_CROSS_PROJECT",
        )
    if task_repo.get_dependency(db, task.id, dep_id) is not None:
        raise errors.conflict(
            "A dependência já existe.", code="TASK_DEPENDENCY_EXISTS"
        )
    edges = task_repo.project_dependency_edges(db, task.project_id)
    if _would_create_cycle(edges, task.id, dep_id):
        raise errors.conflict(
            "A dependência criaria um ciclo.", code="TASK_DEPENDENCY_CYCLE"
        )

    dependency = TaskDependency(
        task_id=task.id, depends_on_task_id=dep_id, created_by=user.id
    )
    db.add(dependency)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
        action="task.dependency_added",
        actor_id=user.id,
        after={"depends_on_task_id": str(dep_id)},
    )
    logger.info(
        "task_dependency_added",
        task_id=str(task.id),
        depends_on=str(dep_id),
        actor_id=str(user.id),
    )
    return dependency


def remove_dependency(
    db: Session, user: User, task_id: uuid.UUID, depends_on_task_id: uuid.UUID
) -> None:
    task = get_task_or_404(db, user, task_id)
    project = _load_project(db, task)
    _require_edit(db, project, user, code="TASK_DEPENDENCY_FORBIDDEN")
    dependency = task_repo.get_dependency(db, task.id, depends_on_task_id)
    if dependency is None:
        raise errors.not_found(
            "Dependência não encontrada.", code="TASK_DEPENDENCY_NOT_FOUND"
        )
    db.delete(dependency)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=task.id,
        action="task.dependency_removed",
        actor_id=user.id,
        before={"depends_on_task_id": str(depends_on_task_id)},
    )
    logger.info(
        "task_dependency_removed",
        task_id=str(task.id),
        depends_on=str(depends_on_task_id),
        actor_id=str(user.id),
    )
