"""API v1 aggregate router.

Feature routers are mounted here as later issues implement them. Kept empty
(but importable) for the foundation so ``main.py`` has a stable mount point.
"""

from __future__ import annotations

from fastapi import APIRouter

api_router = APIRouter()

# Feature routers mounted in subsequent issues, e.g.:
#   from app.api.routes import auth
#   api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
