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
_DEV_DATABASE_URL = "postgresql+psycopg://aurea:aurea@localhost:5433/aurea"
_MIN_JWT_SECRET_LEN = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Core ---
    APP_NAME: str = "Aurea System API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # --- Database ---
    # e.g. postgresql://aurea:aurea@localhost:5433/aurea
    DATABASE_URL: str = "postgresql+psycopg://aurea:aurea@localhost:5433/aurea"
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
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET: str = ""
    R2_ENDPOINT: str = ""
    R2_PUBLIC_URL: str = ""

    # --- Email (Resend) ---
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "no-reply@aurea.example"

    # --- Rate limiting ---
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 5

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
            if errors:
                raise ValueError(
                    "Insecure configuration for a production environment: "
                    + "; ".join(errors)
                )
        return self

    @property
    def cors_origins(self) -> list[str]:
        origins = {self.FRONTEND_URL, self.BACKEND_URL}
        return [o for o in origins if o]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
