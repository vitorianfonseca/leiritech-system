"""Global search route (F18).

A single grouped, role-scoped search across every core entity. Viewing is open
to any authenticated user; results are scoped to what the caller may see (BR-002)
inside ``search_service``. This handler only wires HTTP query params to the
service and serializes the typed response.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.search import SearchResponse
from app.services import search_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=SearchResponse)
def global_search(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str, Query(max_length=255, description="Search term")] = "",
    limit: Annotated[
        int, Query(ge=1, le=search_service.MAX_LIMIT, description="Max hits per group")
    ] = search_service.DEFAULT_LIMIT,
    types: Annotated[
        str | None,
        Query(
            max_length=255,
            description="Optional comma-separated group filter, e.g. "
            "'companies,projects'. Unknown values are ignored.",
        ),
    ] = None,
) -> SearchResponse:
    return search_service.search(db, user, q=q, limit=limit, types=types)
