"""Aggregate calendar route (F12 — the read-only `/calendar` feed).

Single ``GET /calendar?from=&to=[&types=][&projectId=]`` returning the exact
``list[CalendarEvent]`` contract the frontend consumes. Role scoping (BR-002) and
the financial gate (BR-008) are applied in ``calendar_service`` backend-side
(BR-001): a Membro sees only their own dated items; payment (financial) events
reach only callers who can manage financials. The handler authenticates,
validates the range/type filter, and delegates.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.core import errors
from app.database.session import get_db
from app.schemas.calendar import CalendarEvent, CalendarEventType
from app.services import calendar_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]

_VALID_TYPES: frozenset[str] = frozenset(
    (
        "task",
        "meeting",
        "milestone",
        "delivery",
        "next_action",
        "proposal_expiry",
        "payment",
    )
)


def _parse_types(raw: str | None) -> set[CalendarEventType] | None:
    if raw is None:
        return None
    wanted: set[CalendarEventType] = set()
    for token in raw.split(","):
        value = token.strip()
        if not value:
            continue
        if value not in _VALID_TYPES:
            raise errors.bad_request(
                f"Tipo de evento inválido: {value}.", code="INVALID_EVENT_TYPE"
            )
        wanted.add(value)  # type: ignore[arg-type]
    return wanted or None


@router.get("", response_model=list[CalendarEvent])
def get_calendar(
    user: CurrentUser,
    db: DbSession,
    from_: Annotated[date, Query(alias="from", description="Inclusive ISO date")],
    to: Annotated[date, Query(description="Exclusive ISO date")],
    types: Annotated[
        str | None, Query(description="CSV of event types to include")
    ] = None,
    project_id: Annotated[
        uuid.UUID | None, Query(alias="projectId")
    ] = None,
) -> list[CalendarEvent]:
    if to <= from_:
        raise errors.bad_request(
            "O intervalo do calendário é inválido (to deve ser depois de from).",
            code="INVALID_RANGE",
        )
    return calendar_service.get_calendar(
        db,
        user,
        start=from_,
        end=to,
        types=_parse_types(types),
        project_id=project_id,
    )
