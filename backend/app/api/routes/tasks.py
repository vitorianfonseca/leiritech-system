"""Task routes (F10 — state machine, dependency gating, approval rule).

Viewing/editing is scoped for a Membro (BR-002/H7); the state machine (§1.6),
dependency gating + cycle rejection (BR-045/047), blocking (BR-046) and the
approval rule (BR-049 — ``in_review`` → ``done`` is Gestor+/Admin only) all live
in ``task_service``; these handlers only wire HTTP to the service.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.tasks import (
    TaskAssign,
    TaskBlock,
    TaskChecklistItemCreate,
    TaskChecklistItemResponse,
    TaskChecklistItemUpdate,
    TaskCreate,
    TaskDependencyCreate,
    TaskDependencyResponse,
    TaskResponse,
    TaskStatus,
    TaskTransition,
    TaskUnblock,
    TaskUpdate,
)
from app.repositories import projects as project_repo
from app.services import task_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


def _task_response(task, names: dict) -> TaskResponse:
    """Attach the display names a card needs. `names` is pre-fetched by the
    caller so a page of tasks costs three lookups, not three per row."""
    resp = TaskResponse.model_validate(task)
    resp.project_name = names["projects"].get(task.project_id)
    resp.phase_name = names["phases"].get(task.phase_id) if task.phase_id else None
    resp.primary_assignee_name = (
        names["users"].get(task.primary_assignee_id) if task.primary_assignee_id else None
    )
    return resp


def _names_for_tasks(db, tasks: list) -> dict:
    return {
        "projects": project_repo.project_names_for(db, [t.project_id for t in tasks]),
        "phases": project_repo.phase_names_for(db, [t.phase_id for t in tasks]),
        "users": project_repo.names_for(db, [t.primary_assignee_id for t in tasks]),
    }


# --------------------------------------------------------------------------- #
# List / create
# --------------------------------------------------------------------------- #
@router.get("", response_model=Page[TaskResponse])
def list_tasks(
    user: CurrentUser,
    db: DbSession,
    project_id: uuid.UUID | None = None,
    phase_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    status_filter: Annotated[TaskStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    include_archived: bool = False,
    sort: Annotated[
        str, Query(pattern="^-?(created_at|due_date|title)$")
    ] = "-created_at",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[TaskResponse]:
    tasks, total = task_service.list_tasks(
        db,
        user,
        project_id=project_id,
        phase_id=phase_id,
        assignee_id=assignee_id,
        status=status_filter,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    names = _names_for_tasks(db, tasks)
    return Page(
        items=[_task_response(t, names) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    task = task_service.create_task(db, user, payload)
    return _task_response(task, _names_for_tasks(db, [task]))


# --------------------------------------------------------------------------- #
# Single task — get / update / assign
# --------------------------------------------------------------------------- #
@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TaskResponse:
    task = task_service.get_task_or_404(db, user, task_id)
    return _task_response(task, _names_for_tasks(db, [task]))


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    task = task_service.update_task(db, user, task_id, payload)
    return _task_response(task, _names_for_tasks(db, [task]))


@router.post("/{task_id}/assign", response_model=TaskResponse)
def assign_task(
    task_id: uuid.UUID,
    payload: TaskAssign,
    user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    task = task_service.assign_task(db, user, task_id, payload)
    return _task_response(task, _names_for_tasks(db, [task]))


# --------------------------------------------------------------------------- #
# Transitions / blocking (§1.6 / BR-046 / BR-049)
# --------------------------------------------------------------------------- #
@router.post("/{task_id}/transition", response_model=TaskResponse)
def transition_task(
    task_id: uuid.UUID,
    payload: TaskTransition,
    user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    task = task_service.transition_task(db, user, task_id, payload.status)
    return _task_response(task, _names_for_tasks(db, [task]))


@router.post("/{task_id}/block", response_model=TaskResponse)
def block_task(
    task_id: uuid.UUID,
    payload: TaskBlock,
    user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    task = task_service.block_task(db, user, task_id, payload)
    return _task_response(task, _names_for_tasks(db, [task]))


@router.post("/{task_id}/unblock", response_model=TaskResponse)
def unblock_task(
    task_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    payload: TaskUnblock | None = None,
) -> TaskResponse:
    task = task_service.unblock_task(db, user, task_id, payload or TaskUnblock())
    return _task_response(task, _names_for_tasks(db, [task]))


# --------------------------------------------------------------------------- #
# Dependencies (BR-045 / BR-047)
# --------------------------------------------------------------------------- #
@router.get("/{task_id}/dependencies", response_model=list[TaskDependencyResponse])
def list_dependencies(
    task_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> list[TaskDependencyResponse]:
    deps = task_service.list_dependencies(db, user, task_id)
    return [TaskDependencyResponse.model_validate(d) for d in deps]


@router.post(
    "/{task_id}/dependencies",
    response_model=TaskDependencyResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_dependency(
    task_id: uuid.UUID,
    payload: TaskDependencyCreate,
    user: CurrentUser,
    db: DbSession,
) -> TaskDependencyResponse:
    dependency = task_service.add_dependency(db, user, task_id, payload)
    return TaskDependencyResponse.model_validate(dependency)


@router.delete(
    "/{task_id}/dependencies/{depends_on_task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def remove_dependency(
    task_id: uuid.UUID,
    depends_on_task_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> None:
    task_service.remove_dependency(db, user, task_id, depends_on_task_id)


# --------------------------------------------------------------------------- #
# Archive / restore / duplicate (BR-060, audit C13)
# --------------------------------------------------------------------------- #
@router.post("/{task_id}/archive", response_model=TaskResponse)
def archive_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TaskResponse:
    task = task_service.archive_task(db, user, task_id)
    return _task_response(task, _names_for_tasks(db, [task]))


@router.post("/{task_id}/restore", response_model=TaskResponse)
def restore_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TaskResponse:
    task = task_service.restore_task(db, user, task_id)
    return _task_response(task, _names_for_tasks(db, [task]))


@router.post(
    "/{task_id}/duplicate", response_model=TaskResponse, status_code=status.HTTP_201_CREATED
)
def duplicate_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TaskResponse:
    task = task_service.duplicate_task(db, user, task_id)
    return _task_response(task, _names_for_tasks(db, [task]))


# --------------------------------------------------------------------------- #
# Checklist (audit C12)
# --------------------------------------------------------------------------- #
@router.get("/{task_id}/checklist", response_model=list[TaskChecklistItemResponse])
def list_checklist(
    task_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> list[TaskChecklistItemResponse]:
    items = task_service.list_checklist_items(db, user, task_id)
    return [TaskChecklistItemResponse.model_validate(i) for i in items]


@router.post(
    "/{task_id}/checklist",
    response_model=TaskChecklistItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_checklist_item(
    task_id: uuid.UUID,
    payload: TaskChecklistItemCreate,
    user: CurrentUser,
    db: DbSession,
) -> TaskChecklistItemResponse:
    item = task_service.add_checklist_item(db, user, task_id, payload)
    return TaskChecklistItemResponse.model_validate(item)


@router.patch(
    "/{task_id}/checklist/{item_id}", response_model=TaskChecklistItemResponse
)
def update_checklist_item(
    task_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: TaskChecklistItemUpdate,
    user: CurrentUser,
    db: DbSession,
) -> TaskChecklistItemResponse:
    item = task_service.update_checklist_item(db, user, task_id, item_id, payload)
    return TaskChecklistItemResponse.model_validate(item)


@router.delete(
    "/{task_id}/checklist/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_checklist_item(
    task_id: uuid.UUID, item_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    task_service.delete_checklist_item(db, user, task_id, item_id)
