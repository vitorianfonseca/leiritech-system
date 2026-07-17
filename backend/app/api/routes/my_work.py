"""My Work daily hub route (F3/F17 — the personal `/my-work` overview).

Single ``GET /my-work`` returning the exact ``MyWork`` contract the frontend
consumes. The payload is ALWAYS scoped to the authenticated caller (BR-002 — own
work only, never another user's); the review queue is gated to Gestor+/Admin
(BR C3), enforced backend-side (BR-001) in ``my_work_service``. The handler only
authenticates and delegates.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.my_work import MyWork
from app.services import my_work_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=MyWork)
def get_my_work(user: CurrentUser, db: DbSession) -> MyWork:
    return my_work_service.get_my_work(db, user)
