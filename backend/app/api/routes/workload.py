"""Workload / capacity routes (F13 — availability derivation, BR-080..084).

This is a MANAGEMENT view: team-wide workload is visible to Admin/Gestor
(BR-002); a Membro sees their OWN load only. The scoping decision — team vs own
— is made in ``workload_service``, backend-authoritative (BR-001). Handlers stay
thin: authenticate, delegate, serialize. Every capacity figure (net capacity,
allocation %, availability state, over-allocation flag) is DERIVED live, never
stored, so it always reflects the current assignment picture.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireAdmin
from app.database.session import get_db
from app.schemas.workload import (
    RoleCapacityConfigResponse,
    TeamWorkload,
    UpdateRoleCapacityConfigRequest,
    WorkloadEntry,
)
from app.services import workload_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=TeamWorkload)
def get_team_workload(user: CurrentUser, db: DbSession) -> TeamWorkload:
    """Team workload rollup for Admin/Gestor; a single own-row view for Membro."""
    return workload_service.team_workload(db, user)


# Declared before "/{user_id}" so the static path wins.
@router.get("/capacity-config", response_model=list[RoleCapacityConfigResponse])
def list_capacity_config(_admin: RequireAdmin, db: DbSession) -> list[RoleCapacityConfigResponse]:
    """Per-role utilization targets (BR-080/081, audit H16) — Admin-only."""
    return workload_service.list_role_capacity_configs(db)


@router.patch("/capacity-config/{role}", response_model=RoleCapacityConfigResponse)
def update_capacity_config(
    role: str,
    payload: UpdateRoleCapacityConfigRequest,
    _admin: RequireAdmin,
    db: DbSession,
) -> RoleCapacityConfigResponse:
    return workload_service.update_role_capacity_config(
        db,
        role,
        weekly_capacity_hours=payload.weekly_capacity_hours,
        utilization_target_pct=payload.utilization_target_pct,
        internal_cost_rate_cents=payload.internal_cost_rate_cents,
    )


@router.get("/{user_id}", response_model=WorkloadEntry)
def get_user_workload(
    user_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> WorkloadEntry:
    """One member's workload detail. A Membro may only read their own (else 404)."""
    return workload_service.user_workload(db, user, user_id)
