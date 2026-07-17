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

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.workload import TeamWorkload, WorkloadEntry
from app.services import workload_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=TeamWorkload)
def get_team_workload(user: CurrentUser, db: DbSession) -> TeamWorkload:
    """Team workload rollup for Admin/Gestor; a single own-row view for Membro."""
    return workload_service.team_workload(db, user)


@router.get("/{user_id}", response_model=WorkloadEntry)
def get_user_workload(
    user_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> WorkloadEntry:
    """One member's workload detail. A Membro may only read their own (else 404)."""
    return workload_service.user_workload(db, user, user_id)
