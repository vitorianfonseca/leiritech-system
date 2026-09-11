"""Tests for the GitHub issue integration.

The real GitHub API is never called in the suite — ``github_service.create_issue``/
``get_issue`` are monkeypatched so these tests exercise the domain logic
(link persistence, permission gate, not-configured handling) without network
access or filing real issues on every CI run.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.collaboration import GithubIssueLink
from app.services import github_service

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def track() -> Iterator[list[uuid.UUID]]:
    ids: list[uuid.UUID] = []
    yield ids
    db = SessionLocal()
    try:
        if ids:
            db.execute(delete(GithubIssueLink).where(GithubIssueLink.id.in_(ids)))
            db.commit()
    finally:
        db.close()


@pytest.fixture
def fake_github(monkeypatch: pytest.MonkeyPatch):
    """Stub the raw REST client so no network call happens."""
    created: list[dict] = []

    def _is_configured() -> bool:
        return True

    def _create_issue(repo: str, *, title: str, body: str, labels: list[str] | None = None):
        issue = {
            "number": 4242,
            "html_url": f"https://github.com/{repo}/issues/4242",
            "title": title,
            "state": "open",
        }
        created.append(issue)
        return issue

    def _get_issue(repo: str, number: int):
        return {"number": number, "state": "closed"}

    monkeypatch.setattr(github_service, "is_configured", _is_configured)
    monkeypatch.setattr(github_service, "create_issue", _create_issue)
    monkeypatch.setattr(github_service, "get_issue", _get_issue)
    return created


def test_create_issue_links_and_lists(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    project_id = str(uuid.uuid4())

    created = client.post(
        f"{API}/github/issues",
        json={
            "entity_type": "project",
            "entity_id": project_id,
            "title": "Bug: X falha ao guardar",
            "body": "Passos para reproduzir…",
            "labels": ["bug"],
            "repo": "acme/example",
        },
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    track.append(uuid.UUID(body["id"]))
    assert body["issue_number"] == 4242
    assert body["repo"] == "acme/example"
    assert body["state"] == "open"
    assert fake_github[0]["title"] == "Bug: X falha ao guardar"

    listed = client.get(
        f"{API}/github/issues",
        params={"entity_type": "project", "entity_id": project_id},
        headers=_auth(token),
    )
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == body["id"]


def test_membro_cannot_create_issue(client, make_user, fake_github):
    membro = make_user(role="membro")
    resp = client.post(
        f"{API}/github/issues",
        json={
            "entity_type": "audit_finding",
            "entity_id": "C1",
            "title": "x",
            "repo": "acme/example",
        },
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403


def test_membro_can_list_issues(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    created = client.post(
        f"{API}/github/issues",
        json={
            "entity_type": "audit_finding",
            "entity_id": "H1",
            "title": "x",
            "repo": "acme/example",
        },
        headers=_auth(_token(client, gestor.email)),
    )
    track.append(uuid.UUID(created.json()["id"]))

    resp = client.get(
        f"{API}/github/issues",
        params={"entity_type": "audit_finding", "entity_id": "H1"},
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 1


def test_returns_503_when_not_configured(client, make_user, monkeypatch):
    monkeypatch.setattr(github_service, "is_configured", lambda: False)
    gestor = make_user(role="gestor")
    resp = client.post(
        f"{API}/github/issues",
        json={"entity_type": "project", "entity_id": "x", "title": "x", "repo": "a/b"},
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 503, resp.text
    assert resp.json()["error"]["code"] == "GITHUB_NOT_CONFIGURED"


def test_requires_repo_when_no_default_configured(client, make_user, monkeypatch, fake_github):
    monkeypatch.setattr("app.services.github_issue_service.settings.GITHUB_DEFAULT_REPO", "")
    gestor = make_user(role="gestor")
    resp = client.post(
        f"{API}/github/issues",
        json={"entity_type": "project", "entity_id": "x", "title": "x"},
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "GITHUB_REPO_REQUIRED"


def test_refresh_issue_state(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    created = client.post(
        f"{API}/github/issues",
        json={"entity_type": "project", "entity_id": "x", "title": "x", "repo": "a/b"},
        headers=_auth(token),
    )
    link_id = created.json()["id"]
    track.append(uuid.UUID(link_id))
    assert created.json()["state"] == "open"

    refreshed = client.post(f"{API}/github/issues/{link_id}/refresh", headers=_auth(token))
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["state"] == "closed"
