"""Application settings, loaded from environment variables.

Secrets are NEVER hardcoded. All configuration is sourced from the process
environment (or a local ``.env`` file for development).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Insecure development placeholders that must NEVER be used in production.
_INSECURE_JWT_SECRETS = {"", "change-me-in-production", "secret", "changeme"}
_DEV_DATABASE_URL = "postgresql+psycopg://leiritech:leiritech@localhost:5434/leiritech"
_MIN_JWT_SECRET_LEN = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Core ---
    APP_NAME: str = "LeiriTech API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # --- Database ---
    # e.g. postgresql://leiritech:leiritech@localhost:5434/leiritech
    DATABASE_URL: str = "postgresql+psycopg://leiritech:leiritech@localhost:5434/leiritech"
    DB_ECHO: bool = False

    # --- JWT / Auth ---
    # Dev placeholder only. In production the app FAILS TO START unless this is
    # overridden with a strong secret (see _enforce_production_secrets below).
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGO: str = "HS256"
    ACCESS_TOKEN_TTL: int = 900  # seconds (15 min)
    REFRESH_TOKEN_TTL: int = 1_209_600  # seconds (14 days)
    PASSWORD_RESET_TTL: int = 3_600  # seconds (1 hour)
    INVITATION_TTL: int = 604_800  # seconds (7 days)

    # --- URLs / CORS ---
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"

    # --- Object storage (Cloudflare R2 / S3-compatible) ---
    # Storage. R2 is the production provider; when its credentials are absent
    # the facade falls back to the local-filesystem provider so attachments
    # work on a developer machine and in a self-hosted deployment.
    LOCAL_STORAGE_DIR: str = "./var/attachments"
    PUBLIC_API_URL: str = "http://localhost:8000"

    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET: str = ""
    R2_ENDPOINT: str = ""
    R2_PUBLIC_URL: str = ""

    # --- Email (Resend) ---
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "no-reply@leiritech.example"

    # --- GitHub issue integration ---
    # A PAT with `repo` scope. Empty = feature disabled (503, never silent).
    GITHUB_TOKEN: str = ""
    # Default "owner/repo" issues are filed against when a request doesn't
    # name one explicitly (e.g. the internal audit-findings panel).
    GITHUB_DEFAULT_REPO: str = ""

    # --- Rate limiting ---
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 5
    # audit H1: previously only /auth/login was throttled; /password/forgot,
    # /password/reset, /invitations/accept and GET /invitations/{token} were
    # public and unthrottled (mail-bombing via forgot-password; token-guessing
    # via reset/invitation accept).
    PASSWORD_FORGOT_RATE_LIMIT_PER_MINUTE: int = 3
    PUBLIC_TOKEN_RATE_LIMIT_PER_MINUTE: int = 10
    # issue #48: the remaining credential-bearing endpoints. /auth/refresh and
    # /auth/logout are PUBLIC (the refresh token is the only credential), so an
    # unthrottled attacker can grind tokens or revoke guessed sessions.
    REFRESH_RATE_LIMIT_PER_MINUTE: int = 30
    # /auth/me/password verifies current_password — a stolen access token could
    # otherwise brute-force it offline-fast. Keyed per user, not per IP.
    CHANGE_PASSWORD_RATE_LIMIT_PER_MINUTE: int = 5
    # POST /invitations sends an email per call; cap per inviting user so a
    # compromised grant-holder account cannot mail-bomb through us.
    INVITE_SEND_RATE_LIMIT_PER_MINUTE: int = 10

    # Number of reverse proxies in front of the app whose X-Forwarded-For
    # entries may be trusted when deriving the client IP for rate limiting.
    # 0 (default) = ignore the header and use the direct peer address. Set to 1
    # behind a single proxy (Railway/Render/nginx). See core.rate_limit.client_ip.
    TRUSTED_PROXY_COUNT: int = 0

    # --- Workload / capacity (F13, BR-080..084) ---
    # Role-dependent utilization targets (BR-081, Admin-configurable per role).
    # Net delivery capacity = weekly_capacity_hours × target (BR-080). Delivery
    # roles carry the highest billable target; management/lead the lowest, since
    # more of their week is spent coordinating rather than on project work.
    WORKLOAD_TARGET_MEMBRO: float = 0.80
    WORKLOAD_TARGET_GESTOR: float = 0.50
    WORKLOAD_TARGET_ADMIN: float = 0.40
    # Availability band thresholds as a % of net capacity (BR-082): below
    # BALANCED_MIN → disponível; up to OVERALLOCATED → equilibrado; above it →
    # sobrecarregado. Over-allocation warning (BR-084) fires at OVERALLOCATED.
    WORKLOAD_BALANCED_MIN_PCT: float = 70.0
    WORKLOAD_OVERALLOCATED_PCT: float = 100.0

    @field_validator("DATABASE_URL")
    @classmethod
    def normalize_driver(cls, value: str) -> str:
        """Force the psycopg (v3) driver so a bare ``postgresql://`` URL works."""
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @model_validator(mode="after")
    def _enforce_production_secrets(self) -> Settings:
        """Fail fast in production if secrets are missing/weak or dev defaults leak.

        This prevents the app from ever running with the known placeholder JWT
        secret or the local dev database credentials in a real deployment.
        """
        if self.ENVIRONMENT.lower() in {"production", "prod", "staging"}:
            errors: list[str] = []
            if self.JWT_SECRET in _INSECURE_JWT_SECRETS:
                errors.append("JWT_SECRET is unset or a known insecure placeholder")
            elif len(self.JWT_SECRET) < _MIN_JWT_SECRET_LEN:
                errors.append(
                    f"JWT_SECRET must be at least {_MIN_JWT_SECRET_LEN} characters"
                )
            if self.DATABASE_URL == _DEV_DATABASE_URL:
                errors.append("DATABASE_URL is still the local dev default")
            if self.DEBUG:
                errors.append("DEBUG must be false in production")
            errors.extend(self._production_cors_errors())
            if errors:
                raise ValueError(
                    "Insecure configuration for a production environment: "
                    + "; ".join(errors)
                )
        return self

    def _production_cors_errors(self) -> list[str]:
        """CORS misconfigurations that must abort a production/staging boot.

        The app serves CORS with ``allow_credentials=True``. Starlette does NOT
        reject the spec-forbidden "wildcard + credentials" combination for us —
        it produces an incoherent and dangerous policy instead. Measured against
        Starlette 0.46.2 with ``allow_origins=["*"]``:

          preflight OPTIONS -> Access-Control-Allow-Origin: <the requester's origin>
                               Access-Control-Allow-Credentials: true
          actual request    -> Access-Control-Allow-Origin: *
                               Access-Control-Allow-Credentials: true

        because ``preflight_explicit_allow_origin`` is
        ``not allow_all_origins or allow_credentials`` → True. So preflight
        *approves any origin*, while the actual response sends "*", which a
        spec-compliant browser then refuses for a credentialed request. The net
        effect today is a policy that green-lights arbitrary origins at preflight
        and breaks every legitimate credentialed call — and that is one upstream
        behaviour change away from being a real cross-origin read of
        authenticated data. ``cors_origins`` therefore refuses "*" outright in
        every environment; the checks below catch the production-only cases (an
        empty list, or origins left on the dev defaults), which are
        misconfigurations rather than vulnerabilities.
        """
        errors: list[str] = []
        origins = self.cors_origins
        if not origins:
            errors.append(
                "no CORS origins configured — set FRONTEND_URL to the deployed "
                "frontend origin"
            )
        insecure = [
            o
            for o in origins
            if o.startswith("http://")
            or "localhost" in o
            or "127.0.0.1" in o
        ]
        if insecure:
            errors.append(
                "CORS origins must be https and non-local in production, got: "
                + ", ".join(sorted(insecure))
            )
        return errors

    @property
    def cors_origins(self) -> list[str]:
        """The explicit, closed set of browser origins allowed to call the API.

        Never contains "*": the app sends ``allow_credentials=True``, and under
        Starlette a wildcard there degrades into "reflect any Origin and allow
        credentials" (see ``_production_cors_errors``). A wildcard is a
        configuration mistake in every environment, so it is rejected here
        rather than quietly dropped.
        """
        configured = {self.FRONTEND_URL, self.BACKEND_URL}
        wildcards = {o for o in configured if o.strip() in {"*", "null"}}
        if wildcards:
            raise ValueError(
                "FRONTEND_URL/BACKEND_URL must be explicit origins — a '*' (or "
                "'null') origin combined with allow_credentials=True lets ANY "
                "site read authenticated API responses."
            )

        origins = {o.strip().rstrip("/") for o in configured if o and o.strip()}
        # Local Next.js dev ports (3000 default, 3100/3200 fallbacks when taken).
        if self.ENVIRONMENT.lower() in {"development", "dev", "local", "test"}:
            origins.update(
                {
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    "http://localhost:3100",
                    "http://127.0.0.1:3100",
                    "http://localhost:3200",
                    "http://127.0.0.1:3200",
                }
            )
        return sorted(origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
