"""API v1 aggregate router.

Feature routers are mounted here as later issues implement them. Kept empty
(but importable) for the foundation so ``main.py`` has a stable mount point.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import auth, invitations, users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    invitations.router, prefix="/invitations", tags=["invitations"]
)
api_router.include_router(users.router, prefix="/users", tags=["users"])
