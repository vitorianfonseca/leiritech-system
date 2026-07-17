"""Activity-feed routes (BR-064, append-only audit trail).

A single per-entity read: the activity log for one record, newest first. Access
is gated by the SAME visibility rule as comments/attachments —
``attachment_service.authorize_entity_access`` raises 404 when the caller may not
see the parent entity — so a user only ever sees activity for records they can
already see (BR-002, enumeration-safe). The log is append-only; there is no
create/update/delete surface here (producers write via ``activity_service`` from
inside their own domain transactions).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.repositories import comments as comment_repo
from app.schemas.activity import ActivityActor, ActivityFeed, ActivityLogEntry
from app.services import activity_service, attachment_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=ActivityFeed)
def list_activity(
    user: CurrentUser,
    db: DbSession,
    entity_type: Annotated[str, Query(min_length=1, max_length=64)],
    entity_id: Annotated[uuid.UUID, Query()],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> ActivityFeed:
    """Audit entries for one record, newest first. 404 if the caller may not see
    the parent entity (same gate as comments/attachments)."""
    # Raises 404 when out of scope — enumeration-safe (BR-002).
    attachment_service.authorize_entity_access(db, user, entity_type, entity_id)

    rows = activity_service.list_for_entity(
        db, entity_type=entity_type, entity_id=entity_id, limit=limit
    )
    actors = comment_repo.users_by_ids(db, [r.actor_id for r in rows if r.actor_id])

    def _actor(actor_id: uuid.UUID | None) -> ActivityActor:
        actor = actors.get(actor_id) if actor_id else None
        if actor is None:
            # Actor deleted (actor_id SET NULL) — stable placeholder, never null.
            return ActivityActor(
                id=actor_id or uuid.UUID(int=0),
                name="Utilizador removido",
                email="",
                avatar_url=None,
            )
        return ActivityActor(
            id=actor.id, name=actor.name, email=actor.email, avatar_url=actor.avatar_url
        )

    return ActivityFeed(
        items=[
            ActivityLogEntry(
                id=row.id,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                actor=_actor(row.actor_id),
                action=row.action,
                before=row.before,
                after=row.after,
                created_at=row.occurred_at,
            )
            for row in rows
        ]
    )
