"""Comment / @mention routes (F16).

Comments embed on companies, opportunities, proposals, projects and tasks, keyed
by ``(entity_type, entity_id)``. Every endpoint is parent-visibility-gated in
``comment_service`` (BR-002): the caller's identity comes from the access token,
never the client. Handlers stay thin — authenticate, delegate, serialize.

Response bodies are camelCase so the frontend collaboration client can swap its
mock for real ``fetch`` calls without changing any exported type.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.schemas.comments import (
    CommentCreateRequest,
    CommentResponse,
    CommentUpdateRequest,
)
from app.services import comment_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[CommentResponse])
def list_comments(
    user: CurrentUser,
    db: DbSession,
    entity_type: Annotated[str, Query(min_length=1, max_length=64)],
    entity_id: Annotated[uuid.UUID, Query()],
) -> list[CommentResponse]:
    """Comments on a record, oldest first. 404 if the parent is out of scope."""
    return comment_service.list_comments(db, user, entity_type, entity_id)


@router.post("", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    payload: CommentCreateRequest,
    user: CurrentUser,
    db: DbSession,
) -> CommentResponse:
    """Post a comment; persist @mentions and notify the mentioned users."""
    return comment_service.create_comment(db, user, payload)


@router.patch("/{comment_id}", response_model=CommentResponse)
def update_comment(
    comment_id: uuid.UUID,
    payload: CommentUpdateRequest,
    user: CurrentUser,
    db: DbSession,
) -> CommentResponse:
    """Edit your own comment (author only)."""
    return comment_service.update_comment(db, user, comment_id, payload)


@router.delete(
    "/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_comment(
    comment_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete your own comment (author, or Admin)."""
    comment_service.delete_comment(db, user, comment_id)
