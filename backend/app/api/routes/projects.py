"""Project routes (F8 lifecycle + health + cascade, F9 templates).

Viewing is available to any authenticated user (scoped for a Membro, BR-002);
create/edit, every lifecycle transition, health publishing and member management
require Gestor+ with project-management rights (Admin any, Gestor for a project
they own — matrix §3). Business rules — the lifecycle state machine (§1.3),
health publish + override reason (BR-030/031), cascade freeze (BR-053/054) and
template instantiation (F9) — live in ``project_service``; these handlers only
wire HTTP to the service.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireAdmin, RequireGestor
from app.core.permissions import can_manage_financials
from app.database.session import get_db
from app.models.project import Project
from app.models.user import User
from app.schemas.common import Page
from app.schemas.projects import (
    ProjectCreate,
    ProjectFromOpportunity,
    ProjectFromTemplate,
    ProjectHealthPublish,
    ProjectHealthResponse,
    ProjectMemberAdd,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectStateChange,
    ProjectStatus,
    ProjectTemplateCreate,
    ProjectTemplateResponse,
    ProjectTemplateUpdate,
    ProjectUpdate,
)
from app.repositories import projects as project_repo
from app.services import project_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


def _project_response(
    project: Project,
    user: User,
    names: dict[uuid.UUID, str] | None = None,
    companies: dict[uuid.UUID, str] | None = None,
    rollups: dict[uuid.UUID, tuple[int, int, float]] | None = None,
) -> ProjectResponse:
    """Build the response, redacting financial fields for a caller without
    financial visibility (BR-008/audit C1). ``GET /projects`` and
    ``GET /projects/{id}`` are reachable by any authenticated role (Membro
    included) and by a Gestor without the payments grant — neither may see
    ``contracted_value``/``hours_budget``/``internal_cost_rate``, unlike
    ``finance.py``/``reports.py``/``dashboard_service.py``, which already gate
    this correctly."""
    resp = ProjectResponse.model_validate(project)
    # `names` is passed pre-fetched by the list route so a page of projects
    # costs one lookup rather than one per row.
    if project.manager_id is not None and names is not None:
        resp.manager_name = names.get(project.manager_id)
    if project.company_id is not None and companies is not None:
        resp.company_name = companies.get(project.company_id)
    if rollups is not None and project.id in rollups:
        resp.team_count, resp.progress, resp.hours_used = rollups[project.id]
    if not can_manage_financials(user):
        resp.contracted_value = None
        resp.hours_budget = None
        resp.internal_cost_rate = None
    return resp


# --------------------------------------------------------------------------- #
# Templates (F9) — declared before "/{project_id}" so the static paths win.
# --------------------------------------------------------------------------- #
@router.get("/templates", response_model=list[ProjectTemplateResponse])
def list_templates(user: CurrentUser, db: DbSession) -> list[ProjectTemplateResponse]:
    templates = project_service.list_templates(db)
    return [ProjectTemplateResponse.model_validate(t) for t in templates]


@router.post(
    "/templates",
    response_model=ProjectTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_template(
    payload: ProjectTemplateCreate,
    user: RequireAdmin,
    db: DbSession,
) -> ProjectTemplateResponse:
    template = project_service.create_template(db, user, payload)
    return ProjectTemplateResponse.model_validate(template)


@router.get("/templates/{template_id}", response_model=ProjectTemplateResponse)
def get_template(
    template_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ProjectTemplateResponse:
    template = project_service.get_template_or_404(db, template_id)
    return ProjectTemplateResponse.model_validate(template)


@router.patch("/templates/{template_id}", response_model=ProjectTemplateResponse)
def update_template(
    template_id: uuid.UUID,
    payload: ProjectTemplateUpdate,
    user: RequireAdmin,
    db: DbSession,
) -> ProjectTemplateResponse:
    template = project_service.update_template(db, user, template_id, payload)
    return ProjectTemplateResponse.model_validate(template)


@router.delete(
    "/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_template(template_id: uuid.UUID, user: RequireAdmin, db: DbSession) -> None:
    project_service.delete_template(db, user, template_id)


# --------------------------------------------------------------------------- #
# Projects — list / create
# --------------------------------------------------------------------------- #
@router.get("", response_model=Page[ProjectResponse])
def list_projects(
    user: CurrentUser,
    db: DbSession,
    company_id: uuid.UUID | None = None,
    manager_id: uuid.UUID | None = None,
    status_filter: Annotated[ProjectStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    include_archived: bool = False,
    sort: Annotated[
        str, Query(pattern="^-?(name|created_at|deadline)$")
    ] = "-created_at",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[ProjectResponse]:
    projects, total = project_service.list_projects(
        db,
        user,
        company_id=company_id,
        manager_id=manager_id,
        status=status_filter,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    manager_names = project_repo.names_for(db, [p.manager_id for p in projects])
    company_names = project_repo.company_names_for(db, [p.company_id for p in projects])
    rollups = project_repo.rollups_for(db, [p.id for p in projects])
    return Page(
        items=[
            _project_response(p, user, manager_names, company_names, rollups)
            for p in projects
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    user: RequireGestor,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.create_project(db, user, payload)
    return _project_response(
        project,
        user,
        project_repo.names_for(db, [project.manager_id]),
        project_repo.company_names_for(db, [project.company_id]),
    )


@router.post(
    "/from-template",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_from_template(
    payload: ProjectFromTemplate,
    user: RequireGestor,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.create_from_template(db, user, payload)
    return _project_response(
        project,
        user,
        project_repo.names_for(db, [project.manager_id]),
        project_repo.company_names_for(db, [project.company_id]),
    )


@router.post(
    "/from-opportunity",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_from_opportunity(
    payload: ProjectFromOpportunity,
    user: RequireGestor,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.create_from_opportunity(db, user, payload)
    return _project_response(
        project,
        user,
        project_repo.names_for(db, [project.manager_id]),
        project_repo.company_names_for(db, [project.company_id]),
    )


# --------------------------------------------------------------------------- #
# Single project — get / update
# --------------------------------------------------------------------------- #
@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.get_project_or_404(db, user, project_id)
    return _project_response(
        project,
        user,
        project_repo.names_for(db, [project.manager_id]),
        project_repo.company_names_for(db, [project.company_id]),
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    user: RequireGestor,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.update_project(db, user, project_id, payload)
    return _project_response(
        project,
        user,
        project_repo.names_for(db, [project.manager_id]),
        project_repo.company_names_for(db, [project.company_id]),
    )


# --------------------------------------------------------------------------- #
# Lifecycle transitions (§1.3) — one endpoint per target
# --------------------------------------------------------------------------- #
def _state_endpoint(target: str):
    def _handler(
        project_id: uuid.UUID,
        user: RequireGestor,
        db: DbSession,
        payload: ProjectStateChange | None = None,
    ) -> ProjectResponse:
        project = project_service.change_state(
            db, user, project_id, target, payload or ProjectStateChange()
        )
        return _project_response(
        project,
        user,
        project_repo.names_for(db, [project.manager_id]),
        project_repo.company_names_for(db, [project.company_id]),
    )

    return _handler


router.add_api_route(
    "/{project_id}/start",
    _state_endpoint("active"),
    methods=["POST"],
    response_model=ProjectResponse,
    name="start_project",
)
router.add_api_route(
    "/{project_id}/pause",
    _state_endpoint("on_hold"),
    methods=["POST"],
    response_model=ProjectResponse,
    name="pause_project",
)
router.add_api_route(
    "/{project_id}/resume",
    _state_endpoint("active"),
    methods=["POST"],
    response_model=ProjectResponse,
    name="resume_project",
)
router.add_api_route(
    "/{project_id}/complete",
    _state_endpoint("completed"),
    methods=["POST"],
    response_model=ProjectResponse,
    name="complete_project",
)
router.add_api_route(
    "/{project_id}/cancel",
    _state_endpoint("cancelled"),
    methods=["POST"],
    response_model=ProjectResponse,
    name="cancel_project",
)
router.add_api_route(
    "/{project_id}/archive",
    _state_endpoint("archived"),
    methods=["POST"],
    response_model=ProjectResponse,
    name="archive_project",
)


# --------------------------------------------------------------------------- #
# Health (BR-030..032)
# --------------------------------------------------------------------------- #
@router.get("/{project_id}/health", response_model=ProjectHealthResponse)
def get_health(
    project_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> ProjectHealthResponse:
    project = project_service.get_project_or_404(db, user, project_id)
    return ProjectHealthResponse.model_validate(project)


@router.post("/{project_id}/health", response_model=ProjectResponse)
def publish_health(
    project_id: uuid.UUID,
    payload: ProjectHealthPublish,
    user: RequireGestor,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.publish_health(db, user, project_id, payload)
    return _project_response(
        project,
        user,
        project_repo.names_for(db, [project.manager_id]),
        project_repo.company_names_for(db, [project.company_id]),
    )


@router.post("/{project_id}/health/suggest", response_model=ProjectResponse)
def refresh_suggested_health(
    project_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.refresh_suggested_health(db, user, project_id)
    return _project_response(
        project,
        user,
        project_repo.names_for(db, [project.manager_id]),
        project_repo.company_names_for(db, [project.company_id]),
    )


# --------------------------------------------------------------------------- #
# Members
# --------------------------------------------------------------------------- #
@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
def list_members(
    project_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> list[ProjectMemberResponse]:
    members = project_service.list_members(db, user, project_id)
    names = project_repo.names_for(db, [m.user_id for m in members])
    out: list[ProjectMemberResponse] = []
    for m in members:
        resp = ProjectMemberResponse.model_validate(m)
        resp.user_name = names.get(m.user_id)
        out.append(resp)
    return out


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    project_id: uuid.UUID,
    payload: ProjectMemberAdd,
    user: RequireGestor,
    db: DbSession,
) -> ProjectMemberResponse:
    member = project_service.add_member(db, user, project_id, payload)
    resp = ProjectMemberResponse.model_validate(member)
    resp.user_name = project_repo.names_for(db, [member.user_id]).get(member.user_id)
    return resp


@router.delete(
    "/{project_id}/members/{member_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def remove_member(
    project_id: uuid.UUID,
    member_user_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> None:
    project_service.remove_member(db, user, project_id, member_user_id)
