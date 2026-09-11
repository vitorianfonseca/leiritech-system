"""Tests for the GitHub issue integration.

The real GitHub API is never called in the suite — every function on
``github_service`` is monkeypatched so these tests exercise the domain logic
(link persistence, permission gate, not-configured handling, label/assignee
caching) without network access or filing real issues on every CI run.
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
    """Stub the raw REST client so no network call happens. A tiny in-memory
    "GitHub" so create -> list -> update -> refresh -> comments round-trip
    realistically within one test."""
    store: dict[int, dict] = {}
    comments: dict[int, list[dict]] = {}
    next_number = [4242]

    def _is_configured() -> bool:
        return True

    def _create_issue(repo, *, title, body, labels=None, assignees=None):
        number = next_number[0]
        next_number[0] += 1
        issue = {
            "number": number,
            "html_url": f"https://github.com/{repo}/issues/{number}",
            "title": title,
            "state": "open",
            "labels": [{"name": n, "color": "d73a4a", "description": None} for n in (labels or [])],
            "assignees": [
                {"login": a, "avatar_url": f"https://gh/{a}.png"} for a in (assignees or [])
            ],
        }
        store[number] = issue
        comments[number] = []
        return issue

    def _get_issue(repo, number):
        return store[number]

    def _update_issue_impl(repo, number, *, state=None, labels=None, assignees=None):
        issue = store[number]
        if state is not None:
            issue["state"] = state
        if labels is not None:
            issue["labels"] = [{"name": n, "color": "a2eeef", "description": None} for n in labels]
        if assignees is not None:
            issue["assignees"] = [
                {"login": a, "avatar_url": f"https://gh/{a}.png"} for a in assignees
            ]
        return issue

    def _list_labels(repo):
        return [
            {"name": "bug", "color": "d73a4a", "description": "Something isn't working"},
            {"name": "enhancement", "color": "a2eeef", "description": "New feature or request"},
        ]

    def _list_assignable_users(repo):
        return [{"login": "octocat", "avatar_url": "https://gh/octocat.png"}]

    def _list_comments(repo, number):
        return comments[number]

    def _create_comment(repo, number, body):
        comment = {
            "id": len(comments[number]) + 1,
            "user": {"login": "octocat", "avatar_url": "https://gh/octocat.png"},
            "body": body,
            "created_at": "2026-01-01T00:00:00Z",
            "html_url": f"https://github.com/{repo}/issues/{number}#comment",
        }
        comments[number].append(comment)
        return comment

    monkeypatch.setattr(github_service, "is_configured", _is_configured)
    monkeypatch.setattr(github_service, "create_issue", _create_issue)
    monkeypatch.setattr(github_service, "get_issue", _get_issue)
    monkeypatch.setattr(github_service, "update_issue", _update_issue_impl)
    monkeypatch.setattr(github_service, "list_labels", _list_labels)
    monkeypatch.setattr(github_service, "list_assignable_users", _list_assignable_users)
    monkeypatch.setattr(github_service, "list_comments", _list_comments)
    monkeypatch.setattr(github_service, "create_comment", _create_comment)
    return store


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
            "assignees": ["octocat"],
            "repo": "acme/example",
        },
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    track.append(uuid.UUID(body["id"]))
    assert body["repo"] == "acme/example"
    assert body["state"] == "open"
    assert body["labels"] == [{"name": "bug", "color": "d73a4a", "description": None}]
    assert body["assignees"][0]["login"] == "octocat"

    listed = client.get(
        f"{API}/github/issues",
        params={"entity_type": "project", "entity_id": project_id},
        headers=_auth(token),
    )
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == body["id"]


def test_list_filters_by_state_and_label(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    entity_id = str(uuid.uuid4())

    bug = client.post(
        f"{API}/github/issues",
        json={
            "entity_type": "project", "entity_id": entity_id, "title": "bug one",
            "labels": ["bug"], "repo": "acme/example",
        },
        headers=_auth(token),
    ).json()
    track.append(uuid.UUID(bug["id"]))
    feat = client.post(
        f"{API}/github/issues",
        json={
            "entity_type": "project", "entity_id": entity_id, "title": "feature one",
            "labels": ["enhancement"], "repo": "acme/example",
        },
        headers=_auth(token),
    ).json()
    track.append(uuid.UUID(feat["id"]))
    client.patch(
        f"{API}/github/issues/{feat['id']}", json={"state": "closed"}, headers=_auth(token)
    )

    only_bug = client.get(
        f"{API}/github/issues",
        params={"entity_type": "project", "entity_id": entity_id, "label": "bug"},
        headers=_auth(token),
    )
    assert [i["id"] for i in only_bug.json()] == [bug["id"]]

    only_open = client.get(
        f"{API}/github/issues",
        params={"entity_type": "project", "entity_id": entity_id, "state": "open"},
        headers=_auth(token),
    )
    assert [i["id"] for i in only_open.json()] == [bug["id"]]

    only_closed = client.get(
        f"{API}/github/issues",
        params={"entity_type": "project", "entity_id": entity_id, "state": "closed"},
        headers=_auth(token),
    )
    assert [i["id"] for i in only_closed.json()] == [feat["id"]]


def test_close_and_reopen_issue(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    created = client.post(
        f"{API}/github/issues",
        json={"entity_type": "project", "entity_id": "x", "title": "x", "repo": "a/b"},
        headers=_auth(token),
    ).json()
    track.append(uuid.UUID(created["id"]))

    closed = client.patch(
        f"{API}/github/issues/{created['id']}", json={"state": "closed"}, headers=_auth(token)
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["state"] == "closed"

    reopened = client.patch(
        f"{API}/github/issues/{created['id']}", json={"state": "open"}, headers=_auth(token)
    )
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["state"] == "open"


def test_membro_cannot_close_issue(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    created = client.post(
        f"{API}/github/issues",
        json={"entity_type": "project", "entity_id": "x", "title": "x", "repo": "a/b"},
        headers=_auth(_token(client, gestor.email)),
    ).json()
    track.append(uuid.UUID(created["id"]))

    resp = client.patch(
        f"{API}/github/issues/{created['id']}",
        json={"state": "closed"},
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403


def test_update_labels_and_assignees(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    created = client.post(
        f"{API}/github/issues",
        json={"entity_type": "project", "entity_id": "x", "title": "x", "repo": "a/b"},
        headers=_auth(token),
    ).json()
    track.append(uuid.UUID(created["id"]))
    assert created["labels"] == []

    updated = client.patch(
        f"{API}/github/issues/{created['id']}",
        json={"labels": ["enhancement"], "assignees": ["octocat"]},
        headers=_auth(token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["labels"][0]["name"] == "enhancement"
    assert updated.json()["assignees"][0]["login"] == "octocat"


def test_list_labels_and_collaborators(client, make_user, fake_github):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)

    labels = client.get(f"{API}/github/labels", params={"repo": "a/b"}, headers=_auth(token))
    assert labels.status_code == 200, labels.text
    assert {lbl["name"] for lbl in labels.json()} == {"bug", "enhancement"}

    collaborators = client.get(
        f"{API}/github/collaborators", params={"repo": "a/b"}, headers=_auth(token)
    )
    assert collaborators.status_code == 200, collaborators.text
    assert collaborators.json()[0]["login"] == "octocat"


def test_comments_round_trip(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    token = _token(client, gestor.email)
    created = client.post(
        f"{API}/github/issues",
        json={"entity_type": "project", "entity_id": "x", "title": "x", "repo": "a/b"},
        headers=_auth(token),
    ).json()
    track.append(uuid.UUID(created["id"]))

    empty = client.get(f"{API}/github/issues/{created['id']}/comments", headers=_auth(token))
    assert empty.status_code == 200, empty.text
    assert empty.json() == []

    added = client.post(
        f"{API}/github/issues/{created['id']}/comments",
        json={"body": "A trabalhar nisto."},
        headers=_auth(token),
    )
    assert added.status_code == 201, added.text
    assert added.json()["body"] == "A trabalhar nisto."
    assert added.json()["author"] == "octocat"

    listed = client.get(f"{API}/github/issues/{created['id']}/comments", headers=_auth(token))
    assert len(listed.json()) == 1


def test_membro_cannot_comment(client, make_user, track, fake_github):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    created = client.post(
        f"{API}/github/issues",
        json={"entity_type": "project", "entity_id": "x", "title": "x", "repo": "a/b"},
        headers=_auth(_token(client, gestor.email)),
    ).json()
    track.append(uuid.UUID(created["id"]))

    resp = client.post(
        f"{API}/github/issues/{created['id']}/comments",
        json={"body": "x"},
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403


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

    # Simulate the issue being closed on GitHub itself (outside the app).
    number = created.json()["issue_number"]
    fake_github[number]["state"] = "closed"

    refreshed = client.post(f"{API}/github/issues/{link_id}/refresh", headers=_auth(token))
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["state"] == "closed"
