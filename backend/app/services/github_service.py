"""GitHub issue creation — thin REST client (GitHub integration feature).

The app never proxies webhook events or does OAuth-on-behalf-of-a-user; it
holds one server-side PAT (``GITHUB_TOKEN``, `repo` scope) and uses it to file
issues against a repo on the caller's behalf, the same shape as the storage
(R2) and email (Resend) integrations elsewhere in this backend: unconfigured
raises a typed error the route turns into a clear 503, never a silent no-op.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.core.config import settings

logger = structlog.get_logger("aurea.github")

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


def create_issue(
    repo: str, *, title: str, body: str, labels: list[str] | None = None
) -> dict[str, Any]:
    """POST /repos/{repo}/issues. Returns the GitHub API's JSON issue object
    (we only read ``number``/``html_url``/``state`` back)."""
    if not is_configured():
        raise GithubNotConfigured(
            "GITHUB_TOKEN is not set — the GitHub integration is disabled."
        )
    try:
        resp = httpx.post(
            f"{_API_BASE}/repos/{repo}/issues",
            headers=_headers(),
            json={"title": title, "body": body, "labels": labels or []},
            timeout=_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        logger.warning("github_issue_create_network_error", repo=repo, error=str(exc))
        raise GithubApiError(502, "Não foi possível contactar o GitHub.") from exc

    if resp.status_code >= 400:
        logger.warning(
            "github_issue_create_failed",
            repo=repo,
            status_code=resp.status_code,
            body=resp.text[:500],
        )
        message = "Falha ao criar a issue no GitHub."
        try:
            message = resp.json().get("message", message)
        except ValueError:
            pass
        raise GithubApiError(resp.status_code, message)

    logger.info("github_issue_created", repo=repo, number=resp.json().get("number"))
    return resp.json()


def get_issue(repo: str, number: int) -> dict[str, Any]:
    """GET /repos/{repo}/issues/{number} — used to refresh a link's cached
    state (open/closed) on demand."""
    if not is_configured():
        raise GithubNotConfigured(
            "GITHUB_TOKEN is not set — the GitHub integration is disabled."
        )
    try:
        resp = httpx.get(
            f"{_API_BASE}/repos/{repo}/issues/{number}", headers=_headers(), timeout=_TIMEOUT
        )
    except httpx.HTTPError as exc:
        raise GithubApiError(502, "Não foi possível contactar o GitHub.") from exc
    if resp.status_code >= 400:
        raise GithubApiError(resp.status_code, "Não foi possível obter a issue do GitHub.")
    return resp.json()
