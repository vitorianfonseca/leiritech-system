"""Project business logic (F8/F9 — lifecycle, health, cascade, templates).

Every project mutation flows through here so the lifecycle state machine
(WORKFLOW_SPEC §1.3), the health publish rules (BR-030/031), the cascade freeze
(BR-053/054), the Membro visibility boundary (BR-002) and the audit trail
(BR-064) are enforced in exactly one place. Route handlers stay thin:
authenticate, delegate, serialize.

Seams (intentionally NOT implemented here — owned by other domains/issues):

* **Task/phase forward-transition freeze (issue #18)**: while a project is
  frozen (``on_hold``/``completed``/``cancelled``/``archived``) its child tasks
  and phases must reject forward transitions (BR-053/H4). That guard belongs in
  the task/phase services; they call :func:`assert_child_forward_allowed` (or
  read :func:`is_frozen`) so the rule lives in one place. This service only does
  the concrete DB cascade it owns: stopping running timers (BR-042).
* **Payment-milestone defaulting at conversion (finance issue)**: BR-037 says
  milestones default from the accepted proposal; that instantiation is the
  finance domain's job. Spin-up here only links the source proposal.
* **Suggested-health computation (AUTO-05 cron)**: :func:`compute_suggested_health`
  is the pure heuristic the cron persists daily; it is exposed via
  ``POST /{id}/health/suggest`` for a manual refresh but is never auto-published
  (BR-030).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import errors
from app.core.clock import today as app_today
from app.core.permissions import Role, can_cancel_project, can_manage_project, role_at_least
from app.models.crm import Company
from app.models.project import (
    Project,
    ProjectMember,
    ProjectPhase,
    ProjectTemplate,
    TemplatePhase,
    TemplateTask,
)
from app.models.task import Task
from app.models.user import User
from app.repositories import projects as project_repo
from app.schemas.projects import (
    ProjectCreate,
    ProjectFromOpportunity,
    ProjectFromTemplate,
    ProjectHealthPublish,
    ProjectMemberAdd,
    ProjectStateChange,
    ProjectTemplateCreate,
    ProjectTemplateUpdate,
    ProjectUpdate,
)
from app.services import activity_service, notification_service, opportunity_service

logger = structlog.get_logger("leiritech.project")

ENTITY_TYPE = "project"

# Lifecycle transition map (§1.3). Each source status lists its legal targets.
_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "planning": ("active", "cancelled"),
    "active": ("on_hold", "completed", "cancelled"),
    "on_hold": ("active", "completed", "cancelled"),
    "completed": ("archived",),
    "cancelled": ("archived",),
    "archived": (),
}

# "Live" projects: health is meaningful and project-linked crons run (BR-054).
_LIVE_STATUSES = ("planning", "active", "on_hold")
# Frozen projects: child tasks/phases reject forward transitions (BR-053/H4).
_FROZEN_STATUSES = ("on_hold", "completed", "cancelled", "archived")
# Transitions that require a captured reason (§1.3 / BR-053).
_REASON_REQUIRED = ("on_hold", "cancelled")

_SNAPSHOT_FIELDS = (
    "name",
    "company_id",
    "opportunity_id",
    "accepted_proposal_id",
    "manager_id",
    "status",
    "suggested_health",
    "published_health",
    "contracted_value",
)


def _snapshot(project: Project) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in _SNAPSHOT_FIELDS:
        value = getattr(project, field)
        if isinstance(value, uuid.UUID | date | datetime):
            value = str(value)
        out[field] = value
    return out


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


def _is_owner(project: Project, user: User) -> bool:
    return project.manager_id == user.id


# --------------------------------------------------------------------------- #
# Freeze seam (BR-053) — consumed by the task/phase services (issue #18)
# --------------------------------------------------------------------------- #
def is_frozen(project: Project) -> bool:
    """True when the project's state forbids forward transitions on its children
    (BR-053/H4). The task/phase services read this before allowing a child move."""
    return project.status in _FROZEN_STATUSES


def assert_child_forward_allowed(project: Project) -> None:
    """Guard the task/phase services call before a forward child transition.

    Raises 409 when the parent project is frozen (BR-053). Kept here so the
    "is this project frozen?" rule lives in one place across domains.
    """
    if is_frozen(project):
        raise errors.conflict(
            "O projeto está congelado; não é possível avançar tarefas ou fases.",
            code="PROJECT_FROZEN",
        )


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #
def get_project_or_404(db: Session, user: User, project_id: uuid.UUID) -> Project:
    """Load a project, enforcing the Membro visibility boundary (BR-002).

    A Membro requesting a project they neither manage nor belong to gets 404
    (not 403) so they cannot enumerate records outside their scope.
    """
    project = db.get(Project, project_id)
    if project is None:
        raise errors.not_found("Projeto não encontrado.", code="PROJECT_NOT_FOUND")
    if _is_membro(user) and not (
        _is_owner(project, user)
        or project_repo.is_member(db, project.id, user.id)
    ):
        raise errors.not_found("Projeto não encontrado.", code="PROJECT_NOT_FOUND")
    return project


def list_projects(
    db: Session,
    user: User,
    *,
    company_id: uuid.UUID | None,
    manager_id: uuid.UUID | None,
    status: str | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Project], int]:
    scope_filter = (
        project_repo.membro_project_filter(user.id) if _is_membro(user) else None
    )
    return project_repo.list_projects(
        db,
        scope_filter=scope_filter,
        company_id=company_id,
        manager_id=manager_id,
        status=status,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )


# --------------------------------------------------------------------------- #
# Validation helpers
# --------------------------------------------------------------------------- #
def _validate_company(db: Session, company_id: uuid.UUID | None) -> None:
    if company_id is not None and db.get(Company, company_id) is None:
        raise errors.bad_request("Empresa inválida.", code="COMPANY_NOT_FOUND")


def _validate_manager(db: Session, manager_id: uuid.UUID | None) -> None:
    if manager_id is not None and db.get(User, manager_id) is None:
        raise errors.bad_request("Gestor inválido.", code="MANAGER_NOT_FOUND")


def _require_manage(project: Project, user: User, *, code: str) -> None:
    """Lifecycle/health/members require project management rights (matrix §3):
    Admin any, Gestor only for a project they own."""
    if not can_manage_project(user, is_owner=_is_owner(project, user)):
        raise errors.forbidden(
            "Não tem permissão para gerir este projeto.", code=code
        )


# --------------------------------------------------------------------------- #
# Writes — create / update
# --------------------------------------------------------------------------- #
def create_project(db: Session, user: User, payload: ProjectCreate) -> Project:
    _validate_company(db, payload.company_id)
    _validate_manager(db, payload.manager_id)
    project = Project(
        name=payload.name,
        company_id=payload.company_id,
        manager_id=payload.manager_id or user.id,
        description=payload.description,
        start_date=payload.start_date,
        deadline=payload.deadline,
        contracted_value=payload.contracted_value,
        hours_budget=payload.hours_budget,
        internal_cost_rate=payload.internal_cost_rate,
        status="planning",
        created_by=user.id,
    )
    db.add(project)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
        action="project.created",
        actor_id=user.id,
        after=_snapshot(project),
    )
    logger.info("project_created", project_id=str(project.id), actor_id=str(user.id))
    return project


def update_project(
    db: Session, user: User, project_id: uuid.UUID, payload: ProjectUpdate
) -> Project:
    project = get_project_or_404(db, user, project_id)
    _require_manage(project, user, code="PROJECT_MANAGE_FORBIDDEN")
    if project.status == "archived":
        raise errors.conflict(
            "Projeto arquivado não pode ser editado.", code="PROJECT_ARCHIVED"
        )
    before = _snapshot(project)
    changes = payload.model_dump(exclude_unset=True)
    if "company_id" in changes:
        _validate_company(db, changes["company_id"])
    if "manager_id" in changes:
        _validate_manager(db, changes["manager_id"])
    for field, value in changes.items():
        setattr(project, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
        action="project.updated",
        actor_id=user.id,
        before=before,
        after=_snapshot(project),
    )
    logger.info(
        "project_updated",
        project_id=str(project.id),
        actor_id=str(user.id),
        fields=sorted(changes.keys()),
    )
    return project


# --------------------------------------------------------------------------- #
# Lifecycle transitions (§1.3 state machine)
# --------------------------------------------------------------------------- #
def _assert_transition_allowed(project: Project, target: str) -> None:
    if target not in _TRANSITIONS.get(project.status, ()):  # illegal → 409
        raise errors.conflict(
            f"Transição de «{project.status}» para «{target}» não é permitida.",
            code="PROJECT_INVALID_TRANSITION",
        )


def _apply_transition(
    db: Session,
    user: User,
    project: Project,
    *,
    target: str,
    reason: str | None,
    action: str,
) -> Project:
    before = _snapshot(project)
    project.status = target
    if target in _REASON_REQUIRED:
        project.status_reason = reason
    # Cascade freeze (BR-053): pausing/completing/cancelling/archiving stops any
    # running timer on the project's tasks (BR-042). Child forward-transition
    # freezes are enforced lazily by the task/phase services via is_frozen().
    stopped = 0
    if target in _FROZEN_STATUSES:
        stopped = project_repo.stop_running_timers(db, project.id)
    db.flush()
    after = _snapshot(project)
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
        action=action,
        actor_id=user.id,
        before=before,
        after={**after, "reason": reason, "timers_stopped": stopped},
    )
    logger.info(
        action.replace(".", "_"),
        project_id=str(project.id),
        actor_id=str(user.id),
        timers_stopped=stopped,
    )
    return project


def change_state(
    db: Session,
    user: User,
    project_id: uuid.UUID,
    target: str,
    payload: ProjectStateChange,
) -> Project:
    """Single entry point for every lifecycle transition (§1.3). Validates the
    transition against the state machine (409 on illegal), enforces the
    per-target guards, then applies the cascade."""
    project = get_project_or_404(db, user, project_id)
    if target == "cancelled":
        # Audit C17: cancellation is financially gated (design decision #9), not
        # an ordinary owner action — a Gestor without the payments grant must
        # NOT be able to cancel a project they merely own.
        if not can_cancel_project(user, is_owner=_is_owner(project, user)):
            raise errors.forbidden(
                "Cancelar um projeto requer a permissão financeira (grant).",
                code="PROJECT_CANCEL_FORBIDDEN",
            )
    else:
        _require_manage(project, user, code="PROJECT_STATE_FORBIDDEN")
    _assert_transition_allowed(project, target)

    if target in _REASON_REQUIRED and not (payload.reason and payload.reason.strip()):
        raise errors.ApiError(
            status_code=422,
            code="PROJECT_REASON_REQUIRED",
            message="É necessário indicar um motivo para pausar ou cancelar o projeto.",
        )

    if target == "active" and project.status == "planning":
        _assert_can_start(db, project)
    if target == "completed":
        _assert_can_complete(db, project)
    if target == "archived":
        _assert_can_archive(db, project)

    action = {
        "active": (
            "project.resumed" if project.status == "on_hold" else "project.started"
        ),
        "on_hold": "project.paused",
        "completed": "project.completed",
        "cancelled": "project.cancelled",
        "archived": "project.archived",
    }[target]

    result = _apply_transition(
        db, user, project, target=target, reason=payload.reason, action=action
    )
    if target == "archived":
        result.archived_at = datetime.now(tz=UTC)
        db.flush()
    return result


def _assert_can_start(db: Session, project: Project) -> None:
    """``planning`` → ``active`` guard (§1.3 / BR-037/H5): at least one phase and
    one member, and every payment milestone confirmed."""
    missing: list[str] = []
    if project_repo.phase_count(db, project.id) == 0:
        missing.append("phase")
    if project_repo.member_count(db, project.id) == 0:
        missing.append("member")
    if project_repo.unconfirmed_payment_milestone_count(db, project.id) > 0:
        missing.append("payment_milestones_confirmed")
    if missing:
        raise errors.ApiError(
            status_code=422,
            code="PROJECT_START_REQUIREMENTS",
            message=(
                "Antes de iniciar: garanta pelo menos uma fase e um membro e "
                "confirme os marcos de pagamento."
            ),
            details={"missing": missing},
        )


def _assert_can_complete(db: Session, project: Project) -> None:
    """``active``/``on_hold`` → ``completed`` guard (BR-051): all non-archived
    phases must be ``completed``. Open payment milestones are a soft warning
    (not blocked here)."""
    if project_repo.incomplete_phase_count(db, project.id) > 0:
        raise errors.conflict(
            "Todas as fases têm de estar concluídas antes de concluir o projeto.",
            code="PROJECT_PHASES_INCOMPLETE",
        )


def _assert_can_archive(db: Session, project: Project) -> None:
    """``completed``/``cancelled`` → ``archived`` guard (§1.3): no running
    timers. Any that remain are stopped by the cascade, but a lingering timer
    signals an inconsistent state, so we surface it rather than silently end it
    outside the normal flow."""
    if project_repo.running_timer_count(db, project.id) > 0:
        # The cascade will stop them; this is defensive and keeps archive clean.
        project_repo.stop_running_timers(db, project.id)


# --------------------------------------------------------------------------- #
# Health (BR-030..032)
# --------------------------------------------------------------------------- #
def compute_suggested_health(db: Session, project: Project) -> str | None:
    """Pure-ish AUTO-05 heuristic producing ``suggested_health`` (BR-030).

    Only meaningful for live projects (BR-054); returns ``None`` otherwise. The
    heuristic is intentionally simple and self-contained for this issue — the
    full signal set (margin, overdue tasks, budget burn) is layered in when those
    domains are wired. Signals used today:

    * deadline already passed and project not completed → ``at_risk``
    * deadline within 7 days                            → ``attention``
    * otherwise                                         → ``healthy``

    This NEVER writes ``published_health`` — automation never publishes (BR-030).
    """
    if project.status not in _LIVE_STATUSES:
        return None
    today = app_today()
    if project.deadline is not None:
        remaining = (project.deadline - today).days
        if remaining < 0:
            return "at_risk"
        if remaining <= 7:
            return "attention"
    return "healthy"


def refresh_suggested_health(
    db: Session, user: User, project_id: uuid.UUID
) -> Project:
    """Manual trigger of the AUTO-05 suggestion refresh (never publishes)."""
    project = get_project_or_404(db, user, project_id)
    _require_manage(project, user, code="PROJECT_HEALTH_FORBIDDEN")
    suggested = compute_suggested_health(db, project)
    project.suggested_health = suggested
    db.flush()
    logger.info(
        "project_health_suggested",
        project_id=str(project.id),
        suggested=suggested,
        actor_id=str(user.id),
    )
    return project


def publish_health(
    db: Session, user: User, project_id: uuid.UUID, payload: ProjectHealthPublish
) -> Project:
    """Publish a human-owned health (BR-030). Health is only meaningful for live
    projects (§1.4). When the published value differs from the current
    ``suggested_health`` an override reason is mandatory (BR-031 → 422)."""
    project = get_project_or_404(db, user, project_id)
    _require_manage(project, user, code="PROJECT_HEALTH_FORBIDDEN")
    if project.status not in _LIVE_STATUSES:
        raise errors.conflict(
            "A saúde só se aplica a projetos ativos, em planeamento ou em pausa.",
            code="PROJECT_HEALTH_NOT_LIVE",
        )
    is_override = (
        project.suggested_health is not None
        and payload.health != project.suggested_health
    )
    if is_override and not (payload.reason and payload.reason.strip()):
        raise errors.ApiError(
            status_code=422,
            code="PROJECT_HEALTH_REASON_REQUIRED",
            message=(
                "Ao publicar uma saúde diferente da sugerida tem de indicar o motivo."
            ),
            details={"suggested_health": project.suggested_health},
        )
    before = _snapshot(project)
    project.published_health = payload.health
    project.health_reason = payload.reason if is_override else None
    project.health_published_at = datetime.now(tz=UTC)
    project.health_published_by = user.id
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
        action="project.health_published",
        actor_id=user.id,
        before=before,
        after={
            **_snapshot(project),
            "override": is_override,
            "reason": project.health_reason,
        },
    )
    # Event notification (F15 'project health published'): inform the project's
    # members (other than the publisher) that a health was published.
    member_ids = [
        m.user_id
        for m in project_repo.list_members(db, project.id)
        if m.user_id != user.id
    ]
    notification_service.notify_many(
        db,
        user_ids=member_ids,
        type="project_health_published",
        body=f"Saúde do projeto «{project.name}» publicada: {payload.health}.",
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
    )
    logger.info(
        "project_health_published",
        project_id=str(project.id),
        actor_id=str(user.id),
        published_health=payload.health,
        override=is_override,
    )
    return project


# --------------------------------------------------------------------------- #
# Members
# --------------------------------------------------------------------------- #
def add_member(
    db: Session, user: User, project_id: uuid.UUID, payload: ProjectMemberAdd
) -> ProjectMember:
    project = get_project_or_404(db, user, project_id)
    _require_manage(project, user, code="PROJECT_MEMBERS_FORBIDDEN")
    if db.get(User, payload.user_id) is None:
        raise errors.bad_request("Utilizador inválido.", code="USER_NOT_FOUND")
    existing = project_repo.get_member(db, project.id, payload.user_id)
    if existing is not None:
        raise errors.conflict(
            "O utilizador já é membro do projeto.", code="MEMBER_EXISTS"
        )
    member = ProjectMember(
        project_id=project.id,
        user_id=payload.user_id,
        role_in_project=payload.role_in_project,
        created_by=user.id,
    )
    try:
        with db.begin_nested():
            db.add(member)
            db.flush()
    except IntegrityError as exc:
        # Lost the race on uq_project_member (audit H18) → 409, not a 500.
        raise errors.conflict(
            "O utilizador já é membro do projeto.", code="MEMBER_EXISTS"
        ) from exc
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
        action="project.member_added",
        actor_id=user.id,
        after={"user_id": str(payload.user_id)},
    )
    logger.info(
        "project_member_added",
        project_id=str(project.id),
        member_id=str(payload.user_id),
        actor_id=str(user.id),
    )
    return member


def remove_member(
    db: Session, user: User, project_id: uuid.UUID, member_user_id: uuid.UUID
) -> None:
    project = get_project_or_404(db, user, project_id)
    _require_manage(project, user, code="PROJECT_MEMBERS_FORBIDDEN")
    member = project_repo.get_member(db, project.id, member_user_id)
    if member is None:
        raise errors.not_found(
            "Membro não encontrado no projeto.", code="MEMBER_NOT_FOUND"
        )
    db.delete(member)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
        action="project.member_removed",
        actor_id=user.id,
        before={"user_id": str(member_user_id)},
    )
    logger.info(
        "project_member_removed",
        project_id=str(project.id),
        member_id=str(member_user_id),
        actor_id=str(user.id),
    )


def list_members(db: Session, user: User, project_id: uuid.UUID) -> list[ProjectMember]:
    project = get_project_or_404(db, user, project_id)
    return project_repo.list_members(db, project.id)


# --------------------------------------------------------------------------- #
# Templates (F9)
# --------------------------------------------------------------------------- #
def list_templates(db: Session) -> list[ProjectTemplate]:
    return project_repo.list_templates(db)


def get_template_or_404(db: Session, template_id: uuid.UUID) -> ProjectTemplate:
    template = db.get(ProjectTemplate, template_id)
    if template is None:
        raise errors.not_found("Modelo não encontrado.", code="TEMPLATE_NOT_FOUND")
    return template


def create_template(
    db: Session, user: User, payload: ProjectTemplateCreate
) -> ProjectTemplate:
    """Create a canonical template (Admin only, F9). Phases/tasks are created
    with the template so it is immediately usable for instantiation."""
    template = ProjectTemplate(
        name=payload.name,
        description=payload.description,
        expected_duration=payload.expected_duration,
        created_by=user.id,
    )
    db.add(template)
    db.flush()
    for phase in payload.phases:
        tphase = TemplatePhase(
            template_id=template.id,
            name=phase.name,
            order_index=phase.order_index,
            expected_duration=phase.expected_duration,
            created_by=user.id,
        )
        db.add(tphase)
        db.flush()
        for task in phase.tasks:
            db.add(
                TemplateTask(
                    template_phase_id=tphase.id,
                    title=task.title,
                    order_index=task.order_index,
                    role_responsible=task.role_responsible,
                    estimate_hours=task.estimate_hours,
                    created_by=user.id,
                )
            )
    db.flush()
    logger.info(
        "project_template_created",
        template_id=str(template.id),
        actor_id=str(user.id),
    )
    return template


def update_template(
    db: Session, user: User, template_id: uuid.UUID, payload: ProjectTemplateUpdate
) -> ProjectTemplate:
    """Audit C10: previously only bare create/list reached the backend — the
    phase/task editor in Settings → Templates was 100% frontend-mock, lost on
    reload. Mirrors ``proposal_template_service.update_template``'s
    replace-on-save pattern: when ``phases`` is provided it REPLACES the whole
    tree (the ``cascade="all, delete-orphan"`` relationship on
    ``ProjectTemplate.phases`` deletes the old rows automatically)."""
    template = get_template_or_404(db, template_id)
    for field in ("name", "description", "expected_duration"):
        value = getattr(payload, field)
        if value is not None:
            setattr(template, field, value)
    if payload.phases is not None:
        template.phases = [
            TemplatePhase(
                name=phase.name,
                order_index=phase.order_index,
                expected_duration=phase.expected_duration,
                created_by=user.id,
                tasks=[
                    TemplateTask(
                        title=task.title,
                        order_index=task.order_index,
                        role_responsible=task.role_responsible,
                        estimate_hours=task.estimate_hours,
                        created_by=user.id,
                    )
                    for task in phase.tasks
                ],
            )
            for phase in payload.phases
        ]
    db.flush()
    logger.info("project_template_updated", template_id=str(template.id), actor_id=str(user.id))
    return template


def delete_template(db: Session, user: User, template_id: uuid.UUID) -> None:
    """Templates are canonical config, not a client business record — BR-060's
    soft-delete list (companies/opportunities/projects/tasks/proposals) does
    not name templates, so this is a real delete (Admin-only, route-enforced).
    Existing projects already instantiated FROM this template are untouched
    (instantiation copies phases/tasks onto the project; no live FK back to
    the template survives spin-up)."""
    template = get_template_or_404(db, template_id)
    db.delete(template)
    db.flush()
    logger.info("project_template_deleted", template_id=str(template_id), actor_id=str(user.id))


def _instantiate_template(
    db: Session, user: User, project: Project, template_id: uuid.UUID
) -> None:
    """Instantiate a template's phases and tasks onto a freshly created project
    (F9). Phases keep their order and derive a deadline from the project start
    date plus the cumulative expected duration; tasks start in ``todo``."""
    template = get_template_or_404(db, template_id)
    cursor = project.start_date
    for tphase in project_repo.template_phases(db, template.id):
        deadline = None
        if cursor is not None and tphase.expected_duration:
            deadline = cursor + timedelta(days=tphase.expected_duration)
        phase = ProjectPhase(
            project_id=project.id,
            name=tphase.name,
            order_index=tphase.order_index,
            start_date=cursor,
            deadline=deadline,
            status="not_started",
            created_by=user.id,
        )
        db.add(phase)
        db.flush()
        for ttask in project_repo.template_tasks(db, tphase.id):
            db.add(
                Task(
                    project_id=project.id,
                    phase_id=phase.id,
                    title=ttask.title,
                    estimate_hours=ttask.estimate_hours,
                    priority="normal",
                    status="todo",
                    created_by=user.id,
                )
            )
        cursor = deadline or cursor
    db.flush()
    logger.info(
        "project_template_instantiated",
        project_id=str(project.id),
        template_id=str(template.id),
    )


def create_from_template(
    db: Session, user: User, payload: ProjectFromTemplate
) -> Project:
    _validate_company(db, payload.company_id)
    _validate_manager(db, payload.manager_id)
    get_template_or_404(db, payload.template_id)  # 404 before creating anything
    project = Project(
        name=payload.name,
        company_id=payload.company_id,
        manager_id=payload.manager_id or user.id,
        start_date=payload.start_date,
        contracted_value=payload.contracted_value,
        status="planning",
        created_by=user.id,
    )
    db.add(project)
    db.flush()
    _instantiate_template(db, user, project, payload.template_id)
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
        action="project.created_from_template",
        actor_id=user.id,
        after={**_snapshot(project), "template_id": str(payload.template_id)},
    )
    logger.info(
        "project_created_from_template",
        project_id=str(project.id),
        template_id=str(payload.template_id),
        actor_id=str(user.id),
    )
    return project


# --------------------------------------------------------------------------- #
# Won → project spin-up (F7 / BR-035..038)
# --------------------------------------------------------------------------- #
def create_from_opportunity(
    db: Session, user: User, payload: ProjectFromOpportunity
) -> Project:
    """Spin up a project from a won opportunity, consuming the read-only prefill
    produced by ``opportunity_service.convert_opportunity`` (BR-035). The source
    opportunity/proposal links are preserved read-only (BR-036); the linked
    company becomes an active client (BR-038).

    Payment-milestone defaulting (BR-037) is the finance domain's responsibility
    and is intentionally left as a seam — this only links the accepted proposal.
    """
    # Reuse the existing conversion seam; do NOT re-implement or edit it.
    prefill = opportunity_service.convert_opportunity(
        db, user, payload.opportunity_id
    )

    if payload.template_id is not None:
        get_template_or_404(db, payload.template_id)  # 404 before creating anything
    _validate_manager(db, payload.manager_id)

    contracted_value = (
        payload.contracted_value
        if payload.contracted_value is not None
        else prefill.contracted_value
    )
    # BR-035/C1: a verbal close (no accepted proposal) MUST have a manually
    # entered contracted value — the graceful-fallback path is deliberate data
    # reuse, never a way to skip entering a value entirely (audit C9).
    if not prefill.has_accepted_proposal and contracted_value is None:
        raise errors.ApiError(
            status_code=422,
            code="CONTRACTED_VALUE_REQUIRED",
            message=(
                "Sem proposta aceite, é obrigatório indicar o valor contratado "
                "manualmente (BR-035)."
            ),
        )
    project = Project(
        name=payload.name,
        company_id=prefill.company_id,
        opportunity_id=prefill.opportunity_id,
        accepted_proposal_id=prefill.accepted_proposal_id,
        manager_id=payload.manager_id or user.id,
        start_date=payload.start_date,
        deadline=payload.deadline,
        contracted_value=contracted_value,
        status="planning",
        created_by=user.id,
    )
    try:
        with db.begin_nested():
            db.add(project)
            db.flush()
    except IntegrityError as exc:
        # Lost the race on uq_projects_opportunity_live (audit C14): a
        # concurrent conversion already created the project for this
        # opportunity — surface as 409, not a 500 or a silent duplicate.
        raise errors.conflict(
            "Esta oportunidade já foi convertida noutro projeto.",
            code="OPPORTUNITY_ALREADY_CONVERTED",
        ) from exc

    if payload.template_id is not None:
        _instantiate_template(db, user, project, payload.template_id)

    # BR-038: the linked company becomes a "cliente ativo". Simple column write,
    # not a CRM-service behaviour change; documented as a conversion side-effect.
    if prefill.company_id is not None:
        company = db.get(Company, prefill.company_id)
        if company is not None and company.status != "active":
            company.status = "active"

    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=project.id,
        action="project.created_from_opportunity",
        actor_id=user.id,
        after={
            **_snapshot(project),
            "opportunity_id": str(payload.opportunity_id),
            "verbal_close": prefill.verbal_close,
        },
    )
    logger.info(
        "project_created_from_opportunity",
        project_id=str(project.id),
        opportunity_id=str(payload.opportunity_id),
        has_accepted_proposal=prefill.has_accepted_proposal,
        actor_id=str(user.id),
    )
    return project
