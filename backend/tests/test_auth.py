"""Integration tests for the auth + user-admin API against the real Postgres."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.permissions import Role
from app.database.session import SessionLocal
from app.models.user import User

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def _token(client: TestClient, email: str) -> str:
    resp = _login(client, email)
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# --- Login ----------------------------------------------------------------- #
def test_login_success_returns_token_pair(client, make_user):
    user = make_user(role="admin")
    resp = _login(client, user.email)
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0


def test_login_wrong_password_is_generic_401(client, make_user):
    user = make_user(role="membro")
    resp = _login(client, user.email, password="wrong-password")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_unknown_user_is_generic_401(client):
    resp = _login(client, "nobody-xyz@example.com")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_deactivated_user_cannot_login(client, make_user):
    user = make_user(role="membro", status="deactivated")
    resp = _login(client, user.email)
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "ACCOUNT_DEACTIVATED"


# --- /me + token type enforcement ------------------------------------------ #
def test_me_with_access_token(client, make_user):
    user = make_user(role="gestor")
    token = _token(client, user.email)
    resp = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == user.email


def test_me_rejects_refresh_token(client, make_user):
    user = make_user(role="membro")
    refresh = _login(client, user.email).json()["refresh_token"]
    resp = client.get(
        f"{API}/auth/me", headers={"Authorization": f"Bearer {refresh}"}
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_ACCESS_TOKEN"


def test_me_without_token(client):
    resp = client.get(f"{API}/auth/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "NOT_AUTHENTICATED"


# --- Refresh rotation ------------------------------------------------------ #
def test_refresh_rotates_tokens(client, make_user):
    user = make_user(role="membro")
    refresh = _login(client, user.email).json()["refresh_token"]
    resp = client.post(f"{API}/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    new_refresh = resp.json()["refresh_token"]
    assert new_refresh != refresh
    # Old refresh token is now revoked (single-use).
    reuse = client.post(f"{API}/auth/refresh", json={"refresh_token": refresh})
    assert reuse.status_code == 401


def test_refresh_rejects_access_token(client, make_user):
    user = make_user(role="membro")
    access = _login(client, user.email).json()["access_token"]
    resp = client.post(f"{API}/auth/refresh", json={"refresh_token": access})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"


# --- Logout ---------------------------------------------------------------- #
def test_logout_revokes_refresh(client, make_user):
    user = make_user(role="membro")
    refresh = _login(client, user.email).json()["refresh_token"]
    out = client.post(f"{API}/auth/logout", json={"refresh_token": refresh})
    assert out.status_code == 200
    reuse = client.post(f"{API}/auth/refresh", json={"refresh_token": refresh})
    assert reuse.status_code == 401


# --- Change password ------------------------------------------------------- #
def test_change_password_requires_current(client, make_user):
    user = make_user(role="membro")
    token = _token(client, user.email)
    resp = client.post(
        f"{API}/auth/me/password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "nope-nope-nope", "new_password": "brand-new-secret"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"


def test_change_password_success(client, make_user):
    user = make_user(role="membro")
    token = _token(client, user.email)
    resp = client.post(
        f"{API}/auth/me/password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": PASSWORD, "new_password": "brand-new-secret-99"},
    )
    assert resp.status_code == 200
    assert _login(client, user.email, "brand-new-secret-99").status_code == 200


# --- Authorization gates --------------------------------------------------- #
def test_membro_forbidden_on_admin_endpoint(client, make_user):
    membro = make_user(role="membro")
    target = make_user(role="membro")
    token = _token(client, membro.email)
    resp = client.post(
        f"{API}/users/{target.id}/deactivate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "ADMIN_REQUIRED"


def test_gestor_without_grant_cannot_invite(client, make_user):
    gestor = make_user(role="gestor", invites_grant=False)
    token = _token(client, gestor.email)
    resp = client.post(
        f"{API}/invitations",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "invitee@example.com", "role": "membro"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "INVITE_NOT_PERMITTED"


def test_admin_can_deactivate_member(client, make_user):
    admin = make_user(role="admin")
    target = make_user(role="membro")
    token = _token(client, admin.email)
    resp = client.post(
        f"{API}/users/{target.id}/deactivate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "deactivated"


# --- BR-005 last-admin guard ----------------------------------------------- #
def test_deactivate_last_admin_conflicts(client, make_user):
    admin = make_user(role="admin")
    db = SessionLocal()
    try:
        active_admins = db.execute(
            select(func.count()).select_from(User).where(
                User.role == Role.ADMIN, User.status == "active"
            )
        ).scalar_one()
    finally:
        db.close()
    if active_admins != 1:
        import pytest

        pytest.skip(f"environment has {active_admins} active admins; need exactly 1")

    token = _token(client, admin.email)
    resp = client.post(
        f"{API}/users/{admin.id}/deactivate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "LAST_ADMIN"


# --- Invitation accept flow ------------------------------------------------ #
def test_invitation_create_and_accept(client, make_user, cleanup_emails, monkeypatch):
    admin = make_user(role="admin")
    token = _token(client, admin.email)
    invitee_email = "new-hire-xyz@example.com"
    cleanup_emails.append(invitee_email)

    # Capture the accept link (raw token lives only in the email; DB stores hash).
    captured: dict[str, str] = {}

    def _fake_send(*, to, accept_link, role):
        captured["link"] = accept_link

    monkeypatch.setattr(
        "app.services.invitation_service.email_service.send_invitation", _fake_send
    )

    created = client.post(
        f"{API}/invitations",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": invitee_email, "role": "membro"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "pending"

    raw_token = captured["link"].split("token=")[1]
    accepted = client.post(
        f"{API}/invitations/accept",
        json={"token": raw_token, "name": "New Hire", "password": "welcome-secret-1"},
    )
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["email"] == invitee_email
    assert accepted.json()["role"] == "membro"
    # The invitee can now authenticate.
    assert _login(client, invitee_email, "welcome-secret-1").status_code == 200

    # Re-accepting a consumed invite is rejected.
    replay = client.post(
        f"{API}/invitations/accept",
        json={"token": raw_token, "name": "X", "password": "another-secret-1"},
    )
    assert replay.status_code == 409


def test_rate_limit_triggers_429(client, make_user):
    user = make_user(role="membro")
    # Exhaust the limiter for this IP+email with wrong passwords.
    last = None
    for _ in range(20):
        last = _login(client, user.email, password="wrong")
        if last.status_code == 429:
            break
    assert last is not None and last.status_code == 429
    assert last.json()["error"]["code"] == "RATE_LIMITED"
