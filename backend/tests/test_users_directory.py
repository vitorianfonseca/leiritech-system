"""Tests for the user directory + own-preferences routes (Postgres :5433).

Covers:
* directory role scoping — Admin/Gestor get full member fields, a Membro gets
  only the redacted identity slice (BR-002);
* member detail redaction (``GET /users/{id}``);
* preferences are own-scoped — the caller reads/writes only their own row, and a
  PATCH round-trips.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Directory role scoping
# --------------------------------------------------------------------------- #
def test_directory_full_fields_for_management(client, make_user) -> None:
    admin = make_user(role="admin")
    make_user(role="membro")

    resp = client.get(f"{API}/users", headers=_auth(_token(client, admin.email)))
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) >= 2
    me = next(i for i in items if i["id"] == str(admin.id))
    # Management sees the sensitive fields.
    assert me["email"] == admin.email
    assert me["status"] == "active"
    assert me["payments_grant"] is False
    assert me["weekly_capacity_hours"] is not None


def test_directory_redacted_for_membro(client, make_user) -> None:
    admin = make_user(role="admin")
    membro = make_user(role="membro")

    resp = client.get(f"{API}/users", headers=_auth(_token(client, membro.email)))
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    # The admin row is present but stripped of management-only fields.
    other = next(i for i in items if i["id"] == str(admin.id))
    assert other["name"] == admin.name
    assert other["role"] == "admin"
    assert other["email"] is None
    assert other["status"] is None
    assert other["payments_grant"] is None
    assert other["weekly_capacity_hours"] is None


def test_member_detail_redacted_for_membro(client, make_user) -> None:
    admin = make_user(role="admin")
    membro = make_user(role="membro")

    resp = client.get(
        f"{API}/users/{admin.id}", headers=_auth(_token(client, membro.email))
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == admin.name
    assert body["email"] is None


def test_directory_requires_auth(client) -> None:
    resp = client.get(f"{API}/users")
    assert resp.status_code == 401, resp.text


# --------------------------------------------------------------------------- #
# Own preferences
# --------------------------------------------------------------------------- #
def test_preferences_default_then_patch_roundtrip(client, make_user) -> None:
    user = make_user(role="membro")
    headers = _auth(_token(client, user.email))

    # First read materializes a default row.
    got = client.get(f"{API}/users/me/preferences", headers=headers)
    assert got.status_code == 200, got.text
    assert got.json()["theme"] == "light"

    patched = client.patch(
        f"{API}/users/me/preferences",
        headers=headers,
        json={
            "theme": "dark",
            "locale": "en",
            # snake_case on the wire — the frontend client converts before sending.
            "notification_channels": {"mentions": {"inApp": True, "email": False}},
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["theme"] == "dark"
    assert body["locale"] == "en"
    assert body["notification_channels"]["mentions"] == {"inApp": True, "email": False}

    # Persisted — a fresh read returns the updated values.
    again = client.get(f"{API}/users/me/preferences", headers=headers)
    assert again.json()["theme"] == "dark"


def test_preferences_are_own_scoped(client, make_user) -> None:
    """Two users never share a preferences row — each PATCH touches only its own."""
    a = make_user(role="membro")
    b = make_user(role="membro")

    client.patch(
        f"{API}/users/me/preferences",
        headers=_auth(_token(client, a.email)),
        json={"theme": "dark"},
    )
    b_prefs = client.get(
        f"{API}/users/me/preferences", headers=_auth(_token(client, b.email))
    )
    # B is unaffected by A's change.
    assert b_prefs.json()["theme"] == "light"


def test_preferences_reject_invalid_theme(client, make_user) -> None:
    user = make_user(role="membro")
    resp = client.patch(
        f"{API}/users/me/preferences",
        headers=_auth(_token(client, user.email)),
        json={"theme": "neon"},
    )
    assert resp.status_code == 422, resp.text
