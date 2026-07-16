"""User administration routes: activate / deactivate (Admin only)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import RequireAdmin
from app.database.session import get_db
from app.schemas.auth import UserResponse
from app.services import user_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.post("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: uuid.UUID,
    _admin: RequireAdmin,
    db: DbSession,
) -> UserResponse:
    user = user_service.deactivate_user(db, user_id)
    return UserResponse.model_validate(user)


@router.post("/{user_id}/activate", response_model=UserResponse)
def activate_user(
    user_id: uuid.UUID,
    _admin: RequireAdmin,
    db: DbSession,
) -> UserResponse:
    user = user_service.activate_user(db, user_id)
    return UserResponse.model_validate(user)
