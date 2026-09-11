"""GitHub issue integration routes.

Filing an issue, and any mutation of one (close/reopen, labels, assignees,
comments), is Gestor+ — consistent with other create/write actions. Listing
linked issues, labels, assignable users, and comments is open to any
authenticated user so a Membro can still see what's already been filed
against a project they belong to.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.core.config import settings
from app.database.session import get_db
from app.schemas.github import (
    GithubAssigneeInfo,
    GithubCommentCreate,
    GithubCommentResponse,
    GithubIssueCreate,
    GithubIssueLinkResponse,
    GithubIssueUpdate,
    GithubLabelInfo,
)
from app.services import github_issue_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


def _resolve_repo(repo: str | None) -> str:
    return repo or settings.GITHUB_DEFAULT_REPO


@router.post("/issues", response_model=GithubIssueLinkResponse, status_code=status.HTTP_201_CREATED)
def create_issue(
    payload: GithubIssueCreate, user: RequireGestor, db: DbSession
) -> GithubIssueLinkResponse:
    link = github_issue_service.create_and_link_issue(db, user, payload)
    return GithubIssueLinkResponse.model_validate(link)


@router.get("/issues", response_model=list[GithubIssueLinkResponse])
def list_issues(
    user: CurrentUser,
    db: DbSession,
    entity_type: Annotated[str, Query(min_length=1, max_length=64)],
    entity_id: Annotated[str, Query(min_length=1, max_length=255)],
    state: Annotated[str | None, Query(pattern="^(open|closed|all)$")] = None,
    label: Annotated[str | None, Query(max_length=64)] = None,
) -> list[GithubIssueLinkResponse]:
    links = github_issue_service.list_issue_links(
        db, entity_type=entity_type, entity_id=entity_id, state=state, label=label
    )
    return [GithubIssueLinkResponse.model_validate(link) for link in links]


@router.post("/issues/{link_id}/refresh", response_model=GithubIssueLinkResponse)
def refresh_issue(link_id: uuid.UUID, user: CurrentUser, db: DbSession) -> GithubIssueLinkResponse:
    link = github_issue_service.get_link_or_404(db, link_id)
    link = github_issue_service.refresh_issue_state(db, link)
    return GithubIssueLinkResponse.model_validate(link)


@router.patch("/issues/{link_id}", response_model=GithubIssueLinkResponse)
def update_issue(
    link_id: uuid.UUID,
    payload: GithubIssueUpdate,
    user: RequireGestor,
    db: DbSession,
) -> GithubIssueLinkResponse:
    """Close/reopen and/or replace the labels/assignees set."""
    link = github_issue_service.get_link_or_404(db, link_id)
    link = github_issue_service.update_issue(db, link, payload)
    return GithubIssueLinkResponse.model_validate(link)


@router.get("/labels", response_model=list[GithubLabelInfo])
def list_labels(
    user: CurrentUser, repo: Annotated[str | None, Query(max_length=255)] = None
) -> list[GithubLabelInfo]:
    raw = github_issue_service.list_repo_labels(_resolve_repo(repo))
    return [
        GithubLabelInfo(name=lbl["name"], color=lbl["color"], description=lbl.get("description"))
        for lbl in raw
    ]


@router.get("/collaborators", response_model=list[GithubAssigneeInfo])
def list_collaborators(
    user: CurrentUser, repo: Annotated[str | None, Query(max_length=255)] = None
) -> list[GithubAssigneeInfo]:
    raw = github_issue_service.list_repo_assignable_users(_resolve_repo(repo))
    return [GithubAssigneeInfo(login=u["login"], avatar_url=u.get("avatar_url")) for u in raw]


@router.get("/issues/{link_id}/comments", response_model=list[GithubCommentResponse])
def list_comments(
    link_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> list[GithubCommentResponse]:
    link = github_issue_service.get_link_or_404(db, link_id)
    raw = github_issue_service.list_issue_comments(link)
    return [GithubCommentResponse(**c) for c in raw]


@router.post(
    "/issues/{link_id}/comments",
    response_model=GithubCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_comment(
    link_id: uuid.UUID,
    payload: GithubCommentCreate,
    user: RequireGestor,
    db: DbSession,
) -> GithubCommentResponse:
    link = github_issue_service.get_link_or_404(db, link_id)
    comment = github_issue_service.add_issue_comment(link, payload.body)
    return GithubCommentResponse(**comment)
