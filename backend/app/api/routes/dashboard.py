"""Management dashboard route (F2 — the `/dashboard` overview).

Single ``GET /dashboard`` returning the exact ``DashboardData`` contract the
frontend consumes. Role scoping (BR-002) and financial gating (BR-008) are
applied in ``dashboard_service`` backend-side (BR-001): a Membro receives the
scoped own-work payload; financial metrics/charts/attention groups are stripped
for any caller without the finance gate. The handler only authenticates and
delegates.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.dashboard import DashboardData
from app.services import dashboard_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=DashboardData)
def get_dashboard(user: CurrentUser, db: DbSession) -> DashboardData:
    return dashboard_service.get_dashboard(db, user)
