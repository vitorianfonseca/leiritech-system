"""GitHub issue linking — the domain layer over ``github_service`` (the raw
REST client). Every issue filed from the app is recorded as a
``GithubIssueLink`` so the UI can show "already filed" state next to whatever
it was filed about, instead of the app being a one-way, fire-and-forget
button to GitHub.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import errors
from app.core.config import settings
from app.models.collaboration import GithubIssueLink
from app.models.user import User
from app.schemas.github import GithubIssueCreate
from app.services import github_service


def _not_configured() -> errors.ApiError:
    return errors.ApiError(
        status_code=503,
        code="GITHUB_NOT_CONFIGURED",
        message="A integração com o GitHub não está configurada.",
    )


def create_and_link_issue(
    db: Session, user: User, payload: GithubIssueCreate
) -> GithubIssueLink:
    repo = payload.repo or settings.GITHUB_DEFAULT_REPO
    if not repo:
        raise errors.bad_request(
            "Nenhum repositório indicado nem configurado por omissão.",
            code="GITHUB_REPO_REQUIRED",
        )
    if not github_service.is_configured():
        raise _not_configured()

    try:
        issue = github_service.create_issue(
            repo, title=payload.title, body=payload.body, labels=payload.labels
        )
    except github_service.GithubNotConfigured as exc:
        raise _not_configured() from exc
    except github_service.GithubApiError as exc:
        raise errors.ApiError(
            status_code=exc.status_code if exc.status_code < 500 else 502,
            code="GITHUB_API_ERROR",
            message=exc.message,
        ) from exc

    link = GithubIssueLink(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        repo=repo,
        issue_number=issue["number"],
        issue_url=issue["html_url"],
        title=issue["title"],
        state=issue.get("state", "open"),
        created_by=user.id,
    )
    db.add(link)
    db.flush()
    return link


def list_issue_links(
    db: Session, *, entity_type: str, entity_id: str
) -> list[GithubIssueLink]:
    return list(
        db.execute(
            select(GithubIssueLink)
            .where(
                GithubIssueLink.entity_type == entity_type,
                GithubIssueLink.entity_id == entity_id,
            )
            .order_by(GithubIssueLink.created_at.desc())
        ).scalars()
    )


def get_link_or_404(db: Session, link_id: uuid.UUID) -> GithubIssueLink:
    link = db.get(GithubIssueLink, link_id)
    if link is None:
        raise errors.not_found("Ligação não encontrada.", code="GITHUB_LINK_NOT_FOUND")
    return link


def refresh_issue_state(db: Session, link: GithubIssueLink) -> GithubIssueLink:
    """Re-fetch the issue's current open/closed state from GitHub — called
    on demand from the UI, never polled in the background."""
    if not github_service.is_configured():
        raise _not_configured()
    try:
        issue = github_service.get_issue(link.repo, link.issue_number)
    except github_service.GithubApiError as exc:
        raise errors.ApiError(
            status_code=exc.status_code if exc.status_code < 500 else 502,
            code="GITHUB_API_ERROR",
            message=exc.message,
        ) from exc
    link.state = issue.get("state", link.state)
    db.flush()
    return link
