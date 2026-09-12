"""GitHub issue linking — the domain layer over ``github_service`` (the raw
REST client). Every issue filed from the app is recorded as a
``GithubIssueLink`` so the UI can show "already filed" state, labels, and
assignees next to whatever it was filed about, instead of the app being a
one-way, fire-and-forget button to GitHub.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import errors
from app.core.config import settings
from app.core.permissions import Role, role_at_least
from app.models.collaboration import GithubIssueLink
from app.models.user import User
from app.schemas.github import GithubIssueCreate, GithubIssueUpdate
from app.services import attachment_service, github_service


def assert_entity_visible(
    db: Session, user: User, entity_type: str, entity_id: str
) -> None:
    """BR-002: a link inherits the visibility of the record it was filed about.

    A link's title/URL/labels describe the parent record, so listing or reading
    links for a project a Membro is not a member of leaks that project's
    existence and content. Out of scope → 404 (never 403 — enumeration-safe),
    reusing the same per-entity gate the comments/attachments/activity APIs use.

    Gestor+/Admin see every record already (BR-002 is the *Membro* boundary), so
    they short-circuit. ``entity_type`` values with no DB row behind them (today
    ``audit_finding``, whose ``entity_id`` is a free string like "H1") carry no
    per-record visibility and are left alone — they are internal, not client data.
    """
    if role_at_least(user.role, Role.GESTOR):
        return
    if not attachment_service.is_scoped_entity_type(entity_type):
        return
    try:
        parsed = uuid.UUID(entity_id)
    except (ValueError, AttributeError, TypeError):
        # Not a record id at all; nothing to scope against.
        return
    attachment_service.authorize_entity_access(db, user, entity_type, parsed)


def _not_configured() -> errors.ApiError:
    return errors.ApiError(
        status_code=503,
        code="GITHUB_NOT_CONFIGURED",
        message="A integração com o GitHub não está configurada.",
    )


def _api_error(exc: github_service.GithubApiError) -> errors.ApiError:
    return errors.ApiError(
        status_code=exc.status_code if exc.status_code < 500 else 502,
        code="GITHUB_API_ERROR",
        message=exc.message,
    )


def _extract_labels(issue: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"name": lbl["name"], "color": lbl["color"], "description": lbl.get("description")}
        for lbl in issue.get("labels", [])
    ]


def _extract_assignees(issue: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"login": a["login"], "avatar_url": a.get("avatar_url")}
        for a in issue.get("assignees", [])
    ]


def _resolve_repo(repo: str | None) -> str:
    repo = repo or settings.GITHUB_DEFAULT_REPO
    if not repo:
        raise errors.bad_request(
            "Nenhum repositório indicado nem configurado por omissão.",
            code="GITHUB_REPO_REQUIRED",
        )
    return repo


def create_and_link_issue(
    db: Session, user: User, payload: GithubIssueCreate
) -> GithubIssueLink:
    repo = _resolve_repo(payload.repo)
    try:
        issue = github_service.create_issue(
            repo,
            title=payload.title,
            body=payload.body,
            labels=payload.labels,
            assignees=payload.assignees,
        )
    except github_service.GithubNotConfigured as exc:
        raise _not_configured() from exc
    except github_service.GithubApiError as exc:
        raise _api_error(exc) from exc

    link = GithubIssueLink(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        repo=repo,
        issue_number=issue["number"],
        issue_url=issue["html_url"],
        title=issue["title"],
        state=issue.get("state", "open"),
        labels=_extract_labels(issue),
        assignees=_extract_assignees(issue),
        created_by=user.id,
    )
    db.add(link)
    db.flush()
    return link


def list_issue_links(
    db: Session,
    user: User,
    *,
    entity_type: str,
    entity_id: str,
    state: str | None = None,
    label: str | None = None,
) -> list[GithubIssueLink]:
    # BR-002: never list links for a parent record the caller may not see.
    assert_entity_visible(db, user, entity_type, entity_id)
    stmt = select(GithubIssueLink).where(
        GithubIssueLink.entity_type == entity_type, GithubIssueLink.entity_id == entity_id
    )
    if state and state != "all":
        stmt = stmt.where(GithubIssueLink.state == state)
    stmt = stmt.order_by(GithubIssueLink.created_at.desc())
    links = list(db.execute(stmt).scalars())
    if label:
        # Filtered in Python — labels live in a JSONB array, not worth a
        # dedicated GIN index for what is, today, an admin-facing list.
        links = [link for link in links if any(lbl["name"] == label for lbl in link.labels)]
    return links


def get_link_or_404(db: Session, user: User, link_id: uuid.UUID) -> GithubIssueLink:
    link = db.get(GithubIssueLink, link_id)
    if link is None:
        raise errors.not_found("Ligação não encontrada.", code="GITHUB_LINK_NOT_FOUND")
    # BR-002: a link the caller's role cannot reach must 404 like a missing one,
    # otherwise 404-vs-anything-else is an existence oracle for the parent record.
    assert_entity_visible(db, user, link.entity_type, link.entity_id)
    return link


def refresh_issue_state(db: Session, link: GithubIssueLink) -> GithubIssueLink:
    """Re-fetch the issue's current state/labels/assignees from GitHub —
    called on demand from the UI, never polled in the background."""
    try:
        issue = github_service.get_issue(link.repo, link.issue_number)
    except github_service.GithubNotConfigured as exc:
        raise _not_configured() from exc
    except github_service.GithubApiError as exc:
        raise _api_error(exc) from exc
    link.state = issue.get("state", link.state)
    link.labels = _extract_labels(issue)
    link.assignees = _extract_assignees(issue)
    db.flush()
    return link


def update_issue(
    db: Session, link: GithubIssueLink, payload: GithubIssueUpdate
) -> GithubIssueLink:
    """Close/reopen and/or replace the labels/assignees set — one PATCH call,
    then the link's cache is updated from GitHub's own response so it never
    drifts from what GitHub actually stored."""
    try:
        issue = github_service.update_issue(
            link.repo,
            link.issue_number,
            state=payload.state,
            labels=payload.labels,
            assignees=payload.assignees,
        )
    except github_service.GithubNotConfigured as exc:
        raise _not_configured() from exc
    except github_service.GithubApiError as exc:
        raise _api_error(exc) from exc
    link.state = issue.get("state", link.state)
    link.labels = _extract_labels(issue)
    link.assignees = _extract_assignees(issue)
    db.flush()
    return link


def list_repo_labels(repo: str) -> list[dict[str, Any]]:
    try:
        return github_service.list_labels(repo)
    except github_service.GithubNotConfigured as exc:
        raise _not_configured() from exc
    except github_service.GithubApiError as exc:
        raise _api_error(exc) from exc


def list_repo_assignable_users(repo: str) -> list[dict[str, Any]]:
    try:
        return github_service.list_assignable_users(repo)
    except github_service.GithubNotConfigured as exc:
        raise _not_configured() from exc
    except github_service.GithubApiError as exc:
        raise _api_error(exc) from exc


def list_issue_comments(link: GithubIssueLink) -> list[dict[str, Any]]:
    try:
        raw = github_service.list_comments(link.repo, link.issue_number)
    except github_service.GithubNotConfigured as exc:
        raise _not_configured() from exc
    except github_service.GithubApiError as exc:
        raise _api_error(exc) from exc
    return [
        {
            "id": c["id"],
            "author": c["user"]["login"],
            "author_avatar_url": c["user"].get("avatar_url"),
            "body": c["body"],
            "created_at": c["created_at"],
            "url": c["html_url"],
        }
        for c in raw
    ]


def add_issue_comment(link: GithubIssueLink, body: str) -> dict[str, Any]:
    try:
        c = github_service.create_comment(link.repo, link.issue_number, body)
    except github_service.GithubNotConfigured as exc:
        raise _not_configured() from exc
    except github_service.GithubApiError as exc:
        raise _api_error(exc) from exc
    return {
        "id": c["id"],
        "author": c["user"]["login"],
        "author_avatar_url": c["user"].get("avatar_url"),
        "body": c["body"],
        "created_at": c["created_at"],
        "url": c["html_url"],
    }
