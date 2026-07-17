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
from app.database.session import get_db
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
    ProjectUpdate,
)
from app.services import project_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


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
    return Page(
        items=[ProjectResponse.model_validate(p) for p in projects],
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
    return ProjectResponse.model_validate(project)


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
    return ProjectResponse.model_validate(project)


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
    return ProjectResponse.model_validate(project)


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
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    user: RequireGestor,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.update_project(db, user, project_id, payload)
    return ProjectResponse.model_validate(project)


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
        return ProjectResponse.model_validate(project)

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
    return ProjectResponse.model_validate(project)


@router.post("/{project_id}/health/suggest", response_model=ProjectResponse)
def refresh_suggested_health(
    project_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> ProjectResponse:
    project = project_service.refresh_suggested_health(db, user, project_id)
    return ProjectResponse.model_validate(project)


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
    return [ProjectMemberResponse.model_validate(m) for m in members]


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
    return ProjectMemberResponse.model_validate(member)


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
