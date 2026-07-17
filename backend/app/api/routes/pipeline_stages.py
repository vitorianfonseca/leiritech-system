"""Pipeline-stage routes (F5, BR-012 / BR-020).

Listing is available to any authenticated user (the Kanban columns). Creating
and editing stages is Admin-only — stages are a global, admin-configurable
taxonomy (win probability is an attribute, never a transition gate, BR-020).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireAdmin
from app.database.session import get_db
from app.schemas.pipeline import (
    PipelineStageCreate,
    PipelineStageResponse,
    PipelineStageUpdate,
)
from app.services import opportunity_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[PipelineStageResponse])
def list_pipeline_stages(
    user: CurrentUser,
    db: DbSession,
) -> list[PipelineStageResponse]:
    stages = opportunity_service.list_stages(db)
    return [PipelineStageResponse.model_validate(s) for s in stages]


@router.post(
    "", response_model=PipelineStageResponse, status_code=status.HTTP_201_CREATED
)
def create_pipeline_stage(
    payload: PipelineStageCreate,
    user: RequireAdmin,
    db: DbSession,
) -> PipelineStageResponse:
    stage = opportunity_service.create_stage(db, user, payload)
    return PipelineStageResponse.model_validate(stage)


@router.patch("/{stage_id}", response_model=PipelineStageResponse)
def update_pipeline_stage(
    stage_id: uuid.UUID,
    payload: PipelineStageUpdate,
    user: RequireAdmin,
    db: DbSession,
) -> PipelineStageResponse:
    stage = opportunity_service.update_stage(db, user, stage_id, payload)
    return PipelineStageResponse.model_validate(stage)
