"""Schemas for the collaboration comments API (F16).

Field names are serialized in **camelCase** so the frontend collaboration client
(`frontend/src/lib/api/collaboration-types.ts`) can swap its mock for real
`fetch` calls without changing any exported type. FastAPI serializes response
models with ``by_alias=True`` by default, and ``populate_by_name=True`` lets
request bodies arrive as either camelCase (the alias) or snake_case.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that (de)serializes with camelCase aliases."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class DirectoryUser(CamelModel):
    """A user that can author comments and be @mentioned (matches the frontend
    ``DirectoryUser`` shape)."""

    id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None = None


class CommentAttachment(CamelModel):
    """Attachment metadata carried by a comment.

    Real file storage lives in the separate attachments API (#46 / F17); comments
    do not own file bytes yet, so this backend always returns an empty list here.
    The shape is kept so the frontend contract stays intact.
    """

    id: uuid.UUID
    name: str
    size_bytes: int
    mime_type: str
    url: str


class CommentResponse(CamelModel):
    """A single comment on an entity. ``updatedAt != createdAt`` marks an edit."""

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    author: DirectoryUser
    body: str
    # IDs of mentioned directory users (drives notifications).
    mentions: list[uuid.UUID]
    attachments: list[CommentAttachment]
    created_at: datetime
    updated_at: datetime


class CommentCreateRequest(CamelModel):
    """Create a comment on an entity.

    ``authorId`` / ``attachments`` from the frontend ``CreateCommentInput`` are
    intentionally ignored: authorship comes from the access token (never a
    client-supplied id), and attachments are handled by the attachments API.
    Unknown fields are dropped rather than rejected so the contract stays loose.
    """

    entity_type: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    entity_id: uuid.UUID
    body: Annotated[str, StringConstraints(min_length=1, max_length=10_000)]
    mentions: list[uuid.UUID] = []


class CommentUpdateRequest(CamelModel):
    """Edit an existing comment (author only). ``id`` comes from the path."""

    body: Annotated[str, StringConstraints(min_length=1, max_length=10_000)]
    mentions: list[uuid.UUID] = []
