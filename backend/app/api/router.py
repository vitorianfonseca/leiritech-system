"""API v1 aggregate router.

Feature routers are mounted here as later issues implement them. Kept empty
(but importable) for the foundation so ``main.py`` has a stable mount point.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    auth,
    companies,
    contacts,
    interactions,
    invitations,
    opportunities,
    pipeline_stages,
    proposals,
    users,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    invitations.router, prefix="/invitations", tags=["invitations"]
)
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(companies.router, prefix="/companies", tags=["crm"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["crm"])
api_router.include_router(
    interactions.router, prefix="/interactions", tags=["crm"]
)
api_router.include_router(
    pipeline_stages.router, prefix="/pipeline-stages", tags=["pipeline"]
)
api_router.include_router(
    opportunities.router, prefix="/opportunities", tags=["pipeline"]
)
api_router.include_router(
    proposals.router, prefix="/proposals", tags=["proposals"]
)
