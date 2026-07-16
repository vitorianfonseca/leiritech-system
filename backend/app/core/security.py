"""Password hashing (Argon2) and JWT token helpers.

Foundation-level utilities; auth endpoints are implemented in a later issue.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    return _encode(subject, settings.ACCESS_TOKEN_TTL, "access", extra_claims)


def create_refresh_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    return _encode(subject, settings.REFRESH_TOKEN_TTL, "refresh", extra_claims)


class TokenTypeError(Exception):
    """Raised when a token's ``type`` claim does not match what was expected."""


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    """Decode and validate a JWT.

    Verifies signature and expiry (via PyJWT) and, when ``expected_type`` is
    given, that the token's ``type`` claim matches — so a refresh token can
    never be accepted where an access token is required, and vice versa.
    """
    payload: dict[str, Any] = jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGO],
        options={"require": ["exp", "sub", "type"]},
    )
    if expected_type is not None and payload.get("type") != expected_type:
        raise TokenTypeError(
            f"expected a '{expected_type}' token, got '{payload.get('type')}'"
        )
    return payload


def decode_access_token(token: str) -> dict[str, Any]:
    return decode_token(token, expected_type="access")


def decode_refresh_token(token: str) -> dict[str, Any]:
    return decode_token(token, expected_type="refresh")


def _encode(
    subject: str, ttl_seconds: int, token_type: str, extra_claims: dict[str, Any] | None
) -> str:
    now = datetime.now(tz=UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGO)
