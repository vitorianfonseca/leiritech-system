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
    GithubCommitInfo,
    GithubPullInfo,
    GithubRepoActivity,
    GithubRepoSummary,
    GithubAssigneeInfo,
    GithubCommentCreate,
    GithubCommentResponse,
    GithubIssueCreate,
    GithubIssueLinkResponse,
    GithubIssueUpdate,
    GithubLabelInfo,
)
from app.services import github_issue_service, github_service

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
        db, user, entity_type=entity_type, entity_id=entity_id, state=state, label=label
    )
    return [GithubIssueLinkResponse.model_validate(link) for link in links]


@router.post("/issues/{link_id}/refresh", response_model=GithubIssueLinkResponse)
def refresh_issue(link_id: uuid.UUID, user: CurrentUser, db: DbSession) -> GithubIssueLinkResponse:
    link = github_issue_service.get_link_or_404(db, user, link_id)
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
    link = github_issue_service.get_link_or_404(db, user, link_id)
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


@router.get("/activity", response_model=GithubRepoActivity)
def repo_activity(
    user: CurrentUser, repo: Annotated[str | None, Query(max_length=255)] = None
) -> GithubRepoActivity:
    """The repository itself, its recent commits and its open pull requests.

    One endpoint rather than three: the tab wants a single coherent picture,
    and three round trips from the client can each describe a different moment.
    """
    target = _resolve_repo(repo)
    raw_repo = github_service.get_repo(target)
    raw_commits = github_service.list_commits(target, limit=8)
    raw_pulls = github_service.list_pull_requests(target, state="open", limit=8)

    commits = []
    for c in raw_commits:
        commit = c.get("commit") or {}
        author = c.get("author") or {}
        commit_author = commit.get("author") or {}
        message = (commit.get("message") or "").split("\n", 1)[0]
        commits.append(
            GithubCommitInfo(
                sha=c["sha"],
                short_sha=c["sha"][:7],
                message=message,
                author_name=commit_author.get("name"),
                author_login=author.get("login"),
                author_avatar_url=author.get("avatar_url"),
                committed_at=commit_author.get("date"),
                html_url=c.get("html_url", ""),
            )
        )

    pulls = []
    for pr in raw_pulls:
        pr_user = pr.get("user") or {}
        pulls.append(
            GithubPullInfo(
                number=pr["number"],
                title=pr.get("title", ""),
                state=pr.get("state", "open"),
                draft=bool(pr.get("draft")),
                author_login=pr_user.get("login"),
                author_avatar_url=pr_user.get("avatar_url"),
                updated_at=pr.get("updated_at"),
                html_url=pr.get("html_url", ""),
            )
        )

    return GithubRepoActivity(
        repo=GithubRepoSummary(
            name=raw_repo.get("name", target),
            full_name=raw_repo.get("full_name", target),
            description=raw_repo.get("description"),
            html_url=raw_repo.get("html_url", ""),
            default_branch=raw_repo.get("default_branch", "main"),
            open_issues=raw_repo.get("open_issues_count", 0),
            stars=raw_repo.get("stargazers_count", 0),
            pushed_at=raw_repo.get("pushed_at"),
            language=raw_repo.get("language"),
        ),
        commits=commits,
        pulls=pulls,
    )


@router.get("/issues/{link_id}/comments", response_model=list[GithubCommentResponse])
def list_comments(
    link_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> list[GithubCommentResponse]:
    link = github_issue_service.get_link_or_404(db, user, link_id)
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
    link = github_issue_service.get_link_or_404(db, user, link_id)
    comment = github_issue_service.add_issue_comment(link, payload.body)
    return GithubCommentResponse(**comment)
