"""Rate limiting, CORS and secrets-hygiene tests (issue #48, PRD §10).

Covers the endpoints that gained a limiter beyond /auth/login, the limiter
registry the conftest fixture depends on, the proxy-aware client-IP derivation,
and the CORS configuration guards.
"""

from __future__ import annotations

import pytest
from fastapi import Request

from app.api.routes import auth as auth_routes
from app.api.routes import invitations as invitation_routes
from app.core import rate_limit
from app.core.config import Settings
from app.core.rate_limit import SlidingWindowRateLimiter, client_ip

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _login(client, email: str, password: str = PASSWORD):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def _tokens(client, email: str) -> tuple[str, str]:
    resp = _login(client, email)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return body["access_token"], body["refresh_token"]


def _exhaust(call, limit: int):
    """Call ``call`` until it 429s; return the first 429 response (or None)."""
    for _ in range(limit + 5):
        resp = call()
        if resp.status_code == 429:
            return resp
    return None


# --- Newly limited endpoints ------------------------------------------------ #
def test_refresh_is_rate_limited(client, make_user):
    """/auth/refresh is public — an unthrottled endpoint is a token-guessing oracle."""
    user = make_user(role="membro")
    _, refresh_token = _tokens(client, user.email)

    limit = auth_routes.refresh_rate_limiter.max_hits
    resp = _exhaust(
        lambda: client.post(
            f"{API}/auth/refresh", json={"refresh_token": refresh_token}
        ),
        limit,
    )
    assert resp is not None, "refresh never rate-limited"
    assert resp.json()["error"]["code"] == "RATE_LIMITED"


def test_logout_is_rate_limited(client, make_user):
    """/auth/logout is public and revokes sessions — must not be free to grind."""
    user = make_user(role="membro")
    _, refresh_token = _tokens(client, user.email)

    limit = auth_routes.logout_rate_limiter.max_hits
    resp = _exhaust(
        lambda: client.post(
            f"{API}/auth/logout", json={"refresh_token": refresh_token}
        ),
        limit,
    )
    assert resp is not None, "logout never rate-limited"
    assert resp.json()["error"]["code"] == "RATE_LIMITED"


def test_change_password_is_rate_limited(client, make_user):
    """/auth/me/password verifies current_password — brute-forceable with a token."""
    user = make_user(role="membro")
    access, _ = _tokens(client, user.email)
    headers = {"Authorization": f"Bearer {access}"}

    limit = auth_routes.change_password_rate_limiter.max_hits
    resp = _exhaust(
        lambda: client.post(
            f"{API}/auth/me/password",
            json={"current_password": "wrong-password", "new_password": "n3w-passw0rd"},
            headers=headers,
        ),
        limit,
    )
    assert resp is not None, "change-password never rate-limited"
    assert resp.json()["error"]["code"] == "RATE_LIMITED"


def test_change_password_limit_is_per_user_not_per_ip(client, make_user):
    """One user burning their budget must not lock out a colleague on the same IP."""
    victim = make_user(role="membro")
    bystander = make_user(role="membro")

    victim_access, _ = _tokens(client, victim.email)
    limit = auth_routes.change_password_rate_limiter.max_hits
    _exhaust(
        lambda: client.post(
            f"{API}/auth/me/password",
            json={"current_password": "wrong-password", "new_password": "n3w-passw0rd"},
            headers={"Authorization": f"Bearer {victim_access}"},
        ),
        limit,
    )

    # Same TestClient (same IP), different user — must still be served.
    bystander_access, _ = _tokens(client, bystander.email)
    resp = client.post(
        f"{API}/auth/me/password",
        json={"current_password": PASSWORD, "new_password": "another-passw0rd"},
        headers={"Authorization": f"Bearer {bystander_access}"},
    )
    assert resp.status_code == 200, resp.text


def test_create_invitation_is_rate_limited(client, make_user):
    """Each invitation sends mail — cap it per inviting user."""
    admin = make_user(role="admin", invites_grant=True)
    access, _ = _tokens(client, admin.email)
    headers = {"Authorization": f"Bearer {access}"}

    limit = invitation_routes.create_invitation_rate_limiter.max_hits
    counter = iter(range(limit + 10))
    resp = _exhaust(
        lambda: client.post(
            f"{API}/invitations",
            json={
                "email": f"invitee-{next(counter)}@example.com",
                "role": "membro",
            },
            headers=headers,
        ),
        limit,
    )
    assert resp is not None, "invitation creation never rate-limited"
    assert resp.json()["error"]["code"] == "RATE_LIMITED"


# --- Limiter registry (test-isolation contract) ----------------------------- #
def test_new_limiters_are_registered_and_reset_by_reset_all():
    """A limiter created anywhere must be covered by reset_all().

    conftest's autouse fixture calls reset_all(); if registration ever breaks,
    limiter state leaks across tests and the suite becomes order-dependent.
    """
    limiter = SlidingWindowRateLimiter(1)
    assert limiter.check("k") is True
    assert limiter.check("k") is False, "limit of 1 should reject the second hit"

    rate_limit.reset_all()
    assert limiter.check("k") is True, "reset_all() did not clear the new limiter"


def test_every_endpoint_limiter_is_in_the_registry():
    """Guards against a limiter being constructed outside the registry."""
    known = [
        auth_routes.login_rate_limiter,
        auth_routes.login_ip_rate_limiter,
        auth_routes.forgot_password_rate_limiter,
        auth_routes.forgot_password_ip_rate_limiter,
        auth_routes.reset_password_rate_limiter,
        auth_routes.refresh_rate_limiter,
        auth_routes.logout_rate_limiter,
        auth_routes.change_password_rate_limiter,
        invitation_routes.accept_invitation_rate_limiter,
        invitation_routes.get_invitation_rate_limiter,
        invitation_routes.create_invitation_rate_limiter,
    ]
    registry = rate_limit._REGISTRY
    for limiter in known:
        assert any(entry is limiter for entry in registry)


# --- Proxy-aware client IP -------------------------------------------------- #
def _request(headers: dict[str, str], peer: str = "10.0.0.1") -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw, "client": (peer, 1234)})


def test_client_ip_ignores_forwarded_header_when_untrusted(monkeypatch):
    """Default (0 proxies): XFF is attacker-controlled and must be ignored."""
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_COUNT", 0)
    req = _request({"x-forwarded-for": "1.2.3.4"}, peer="10.0.0.1")
    assert client_ip(req) == "10.0.0.1"


def test_client_ip_uses_forwarded_header_behind_one_proxy(monkeypatch):
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_COUNT", 1)
    req = _request({"x-forwarded-for": "1.2.3.4"}, peer="10.0.0.1")
    assert client_ip(req) == "1.2.3.4"


def test_client_ip_ignores_spoofed_entries_a_client_prepends(monkeypatch):
    """With 1 trusted proxy only the LAST entry was appended by that proxy."""
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_COUNT", 1)
    # Client forged "9.9.9.9"; the proxy appended the real "1.2.3.4".
    req = _request({"x-forwarded-for": "9.9.9.9, 1.2.3.4"}, peer="10.0.0.1")
    assert client_ip(req) == "1.2.3.4"


def test_client_ip_fails_closed_when_chain_shorter_than_configured(monkeypatch):
    """Misconfigured depth must fall back to the unspoofable peer, not hops[0]."""
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_COUNT", 3)
    req = _request({"x-forwarded-for": "9.9.9.9"}, peer="10.0.0.1")
    assert client_ip(req) == "10.0.0.1"


def test_client_ip_falls_back_to_peer_without_header(monkeypatch):
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_COUNT", 1)
    assert client_ip(_request({}, peer="10.0.0.1")) == "10.0.0.1"


# --- CORS configuration ----------------------------------------------------- #
def _settings(**overrides) -> Settings:
    base = {
        "ENVIRONMENT": "development",
        "JWT_SECRET": "x" * 40,
        "DATABASE_URL": "postgresql+psycopg://u:p@db.example.com:5432/app",
        "FRONTEND_URL": "https://app.example.com",
        "BACKEND_URL": "https://api.example.com",
        "DEBUG": False,
    }
    base.update(overrides)
    return Settings(**base)


def test_starlette_does_not_protect_us_from_wildcard_plus_credentials():
    """Pins the upstream behaviour that makes the wildcard guard necessary.

    Starlette does not reject "*" + allow_credentials; it approves the
    requester's origin at preflight while returning "*" on the actual response.
    If a future Starlette starts rejecting the combination outright this test
    fails loudly — at which point the guard can be reconsidered, not silently
    kept on a stale premise.
    """
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["GET"],
        allow_headers=["Authorization"],
    )

    @app.get("/x")
    def _x() -> dict[str, str]:
        return {"secret": "tenant-data"}

    preflight = TestClient(app).options(
        "/x",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert preflight.headers["access-control-allow-origin"] == "https://evil.example"
    assert preflight.headers["access-control-allow-credentials"] == "true"


def test_app_cors_policy_is_a_closed_set_without_credentialed_wildcard():
    """The real app must never approve an unknown origin at preflight."""
    from app.main import app as real_app

    cors = next(
        m for m in real_app.user_middleware if "CORS" in m.cls.__name__
    )
    configured = cors.kwargs["allow_origins"]
    assert "*" not in configured
    assert cors.kwargs["allow_credentials"] is True
    # A regex would be an alternative way to let arbitrary origins through.
    assert not cors.kwargs.get("allow_origin_regex")
    assert "*" not in cors.kwargs["allow_methods"]
    assert "*" not in cors.kwargs["allow_headers"]


def test_cors_origins_never_contain_a_wildcard():
    """allow_credentials=True + "*" lets ANY site read authenticated responses.

    Starlette does not block that combination: it reflects the request Origin
    back and still sends Access-Control-Allow-Credentials: true.
    """
    with pytest.raises(ValueError, match="explicit origins"):
        _ = _settings(FRONTEND_URL="*").cors_origins


def test_cors_origins_reject_null_origin():
    with pytest.raises(ValueError, match="explicit origins"):
        _ = _settings(BACKEND_URL="null").cors_origins


def test_cors_origins_are_an_explicit_closed_set():
    """Always a finite enumerated list — never a wildcard, never a regex."""
    origins = _settings().cors_origins
    assert "https://app.example.com" in origins
    assert "https://api.example.com" in origins
    assert "*" not in origins
    assert not any("*" in o for o in origins)


def test_cors_origins_include_dev_ports_only_in_development():
    dev = _settings(ENVIRONMENT="development").cors_origins
    assert "http://localhost:3000" in dev

    prod = _settings(ENVIRONMENT="production").cors_origins
    assert not any("localhost" in o for o in prod)


def test_production_rejects_localhost_cors_origin():
    with pytest.raises(ValueError, match="https and non-local"):
        _settings(ENVIRONMENT="production", FRONTEND_URL="http://localhost:3000")


def test_production_rejects_plain_http_cors_origin():
    with pytest.raises(ValueError, match="https and non-local"):
        _settings(
            ENVIRONMENT="production",
            FRONTEND_URL="http://app.example.com",
            BACKEND_URL="https://api.example.com",
        )


def test_production_rejects_empty_cors_origins():
    with pytest.raises(ValueError, match="no CORS origins"):
        _settings(ENVIRONMENT="production", FRONTEND_URL="", BACKEND_URL="")


def test_production_accepts_https_origins():
    settings = _settings(ENVIRONMENT="production")
    assert settings.cors_origins == [
        "https://api.example.com",
        "https://app.example.com",
    ]


def test_cors_origins_are_normalised_without_trailing_slash():
    """A trailing slash makes the Origin never match — browsers send no slash."""
    origins = _settings(FRONTEND_URL="https://app.example.com/").cors_origins
    assert "https://app.example.com" in origins
    assert "https://app.example.com/" not in origins


# --- Secrets hygiene -------------------------------------------------------- #
def test_rich_seed_has_no_hardcoded_admin_password():
    """The dev seed must resolve its admin password from the environment."""
    from app.database import seed_rich

    assert not hasattr(seed_rich, "LOGIN_ADMIN_PASSWORD")
    assert callable(seed_rich.login_admin_password)


def test_rich_seed_password_comes_from_the_environment(monkeypatch):
    from app.database import seed_rich

    monkeypatch.setattr(seed_rich, "_login_password", None)
    monkeypatch.setattr(seed_rich, "_login_password_generated", False)
    monkeypatch.setenv("SEED_RICH_ADMIN_PASSWORD", "from-the-environment")
    assert seed_rich.login_admin_password() == "from-the-environment"


def test_rich_seed_generates_a_random_password_when_unset(monkeypatch):
    from app.database import seed_rich

    monkeypatch.delenv("SEED_RICH_ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
    monkeypatch.setattr(seed_rich, "_login_password", None)
    monkeypatch.setattr(seed_rich, "_login_password_generated", False)

    first = seed_rich.login_admin_password()
    assert len(first) >= 16
    # Stable within a run so the admin creation and the printed value agree.
    assert seed_rich.login_admin_password() == first

    monkeypatch.setattr(seed_rich, "_login_password", None)
    assert seed_rich.login_admin_password() != first, "password must not be fixed"


def test_rich_seed_refuses_to_run_outside_development(monkeypatch):
    """The guard must sit on the work itself, not only on the CLI entrypoint."""
    from app.database import seed_rich

    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="DEV-ONLY"):
        seed_rich.run_rich_seed(db=None)
