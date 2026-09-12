"""GitHub issues — thin REST client (GitHub integration feature).

The app never proxies webhook events or does OAuth-on-behalf-of-a-user; it
holds one server-side PAT (``GITHUB_TOKEN``, `repo` scope) and uses it to
manage issues against a repo on the caller's behalf, the same shape as the
storage (R2) and email (Resend) integrations elsewhere in this backend:
unconfigured raises a typed error the route turns into a clear 503, never a
silent no-op.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.core.config import settings

logger = structlog.get_logger("leiritech.github")

_API_BASE = "https://api.github.com"
_TIMEOUT = 15.0


class GithubNotConfigured(RuntimeError):
    """Raised when a GitHub operation is attempted without GITHUB_TOKEN set."""


class GithubApiError(RuntimeError):
    """Raised when GitHub's API rejects the request (bad repo, bad token, …)."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def is_configured() -> bool:
    return bool(settings.GITHUB_TOKEN)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _request(
    method: str, path: str, *, json: Any = None, action: str
) -> Any:
    """Shared call path for every endpoint below — one place that enforces
    "configured" and turns a transport/HTTP error into a typed exception."""
    if not is_configured():
        raise GithubNotConfigured(
            "GITHUB_TOKEN is not set — the GitHub integration is disabled."
        )
    try:
        resp = httpx.request(
            method, f"{_API_BASE}{path}", headers=_headers(), json=json, timeout=_TIMEOUT
        )
    except httpx.HTTPError as exc:
        logger.warning(f"github_{action}_network_error", path=path, error=str(exc))
        raise GithubApiError(502, "Não foi possível contactar o GitHub.") from exc

    if resp.status_code >= 400:
        logger.warning(
            f"github_{action}_failed", path=path, status_code=resp.status_code, body=resp.text[:500]
        )
        message = "O GitHub recusou o pedido."
        try:
            message = resp.json().get("message", message)
        except ValueError:
            pass
        raise GithubApiError(resp.status_code, message)

    logger.info(f"github_{action}_ok", path=path)
    return resp.json() if resp.text else None


def create_issue(
    repo: str,
    *,
    title: str,
    body: str,
    labels: list[str] | None = None,
    assignees: list[str] | None = None,
) -> dict[str, Any]:
    """POST /repos/{repo}/issues."""
    return _request(
        "POST",
        f"/repos/{repo}/issues",
        json={
            "title": title,
            "body": body,
            "labels": labels or [],
            "assignees": assignees or [],
        },
        action="issue_create",
    )


def get_issue(repo: str, number: int) -> dict[str, Any]:
    """GET /repos/{repo}/issues/{number} — used to refresh a link's cached
    state/labels/assignees on demand."""
    return _request("GET", f"/repos/{repo}/issues/{number}", action="issue_get")


def update_issue(
    repo: str,
    number: int,
    *,
    state: str | None = None,
    labels: list[str] | None = None,
    assignees: list[str] | None = None,
) -> dict[str, Any]:
    """PATCH /repos/{repo}/issues/{number} — close/reopen, or replace the
    labels/assignees sets. Any parameter left ``None`` is omitted (GitHub
    leaves that field unchanged), matching PATCH semantics elsewhere in this
    backend."""
    payload: dict[str, Any] = {}
    if state is not None:
        payload["state"] = state
    if labels is not None:
        payload["labels"] = labels
    if assignees is not None:
        payload["assignees"] = assignees
    return _request(
        "PATCH", f"/repos/{repo}/issues/{number}", json=payload, action="issue_update"
    )


def list_labels(repo: str) -> list[dict[str, Any]]:
    """GET /repos/{repo}/labels — every label defined on the repo, for the
    create-issue picker."""
    return _request("GET", f"/repos/{repo}/labels?per_page=100", action="labels_list")


def create_label(repo: str, *, name: str, color: str, description: str = "") -> dict[str, Any]:
    """POST /repos/{repo}/labels."""
    return _request(
        "POST",
        f"/repos/{repo}/labels",
        json={"name": name, "color": color, "description": description},
        action="label_create",
    )


def list_assignable_users(repo: str) -> list[dict[str, Any]]:
    """GET /repos/{repo}/assignees — accounts that may be assigned an issue."""
    return _request("GET", f"/repos/{repo}/assignees?per_page=100", action="assignees_list")


def list_comments(repo: str, number: int) -> list[dict[str, Any]]:
    """GET /repos/{repo}/issues/{number}/comments."""
    return _request(
        "GET", f"/repos/{repo}/issues/{number}/comments?per_page=100", action="comments_list"
    )


def create_comment(repo: str, number: int, body: str) -> dict[str, Any]:
    """POST /repos/{repo}/issues/{number}/comments."""
    return _request(
        "POST",
        f"/repos/{repo}/issues/{number}/comments",
        json={"body": body},
        action="comment_create",
    )


# --------------------------------------------------------------------------- #
# Repository activity
#
# Beyond the linked issues: what the repository itself is doing. All reads,
# all through the same PAT and the same `_request` error translation, so a
# missing token or a rate limit surfaces identically to the issue calls.
# --------------------------------------------------------------------------- #
def get_repo(repo: str) -> dict[str, Any]:
    """GET /repos/{repo} — description, default branch, counts, last push."""
    return _request("GET", f"/repos/{repo}", action="repo_get")


def list_commits(repo: str, *, limit: int = 10) -> list[dict[str, Any]]:
    """Most recent commits on the default branch."""
    return _request(
        "GET", f"/repos/{repo}/commits?per_page={limit}", action="commits_list"
    )


def list_pull_requests(repo: str, *, state: str = "open", limit: int = 10) -> list[dict[str, Any]]:
    """Pull requests, newest first. `state` is open | closed | all."""
    return _request(
        "GET",
        f"/repos/{repo}/pulls?state={state}&per_page={limit}&sort=updated&direction=desc",
        action="pulls_list",
    )
