"""GitHub issue integration routes.

Filing an issue is Gestor+ (matrix-style write gate, consistent with other
create actions); listing linked issues is open to any authenticated user so a
Membro can still see what's already been filed against a project they belong
to.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.github import GithubIssueCreate, GithubIssueLinkResponse
from app.services import github_issue_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


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
) -> list[GithubIssueLinkResponse]:
    links = github_issue_service.list_issue_links(
        db, entity_type=entity_type, entity_id=entity_id
    )
    return [GithubIssueLinkResponse.model_validate(link) for link in links]


@router.post("/issues/{link_id}/refresh", response_model=GithubIssueLinkResponse)
def refresh_issue(link_id: uuid.UUID, user: CurrentUser, db: DbSession) -> GithubIssueLinkResponse:
    link = github_issue_service.get_link_or_404(db, link_id)
    link = github_issue_service.refresh_issue_state(db, link)
    return GithubIssueLinkResponse.model_validate(link)
