"""Application settings, loaded from environment variables.

Secrets are NEVER hardcoded. All configuration is sourced from the process
environment (or a local ``.env`` file for development).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    @field_validator("DATABASE_URL")
    @classmethod
    def normalize_driver(cls, value: str) -> str:
        """Force the psycopg (v3) driver so a bare ``postgresql://`` URL works."""
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @property
    def cors_origins(self) -> list[str]:
        origins = {self.FRONTEND_URL, self.BACKEND_URL}
        return [o for o in origins if o]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
