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
    dashboard,
    finance,
    interactions,
    invitations,
    notifications,
    opportunities,
    phases,
    pipeline_stages,
    projects,
    proposals,
    reports,
    search,
    tasks,
    time,
    users,
    workload,
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
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(phases.router, prefix="/phases", tags=["projects"])
api_router.include_router(
    phases.milestones_router, prefix="/milestones", tags=["projects"]
)
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(time.router, prefix="/time", tags=["time"])
api_router.include_router(finance.router, prefix="/finance", tags=["finance"])
api_router.include_router(workload.router, prefix="/workload", tags=["workload"])
api_router.include_router(
    notifications.router, prefix="/notifications", tags=["notifications"]
)
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(
    dashboard.router, prefix="/dashboard", tags=["dashboard"]
)
