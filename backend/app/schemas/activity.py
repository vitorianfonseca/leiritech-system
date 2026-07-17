"""Activity-feed schemas (BR-064, append-only audit trail).

Serialized in **camelCase** so the frontend collaboration client
(`frontend/src/lib/api/collaboration-types.ts` ``ActivityLog``) can swap its mock
for real ``fetch`` with no type change — matching the sibling ``schemas.comments``
convention (same collaboration surface, same ``DirectoryUser`` actor shape).

INTEGRATION-GAP: the frontend ``ActivityLog`` also carries a ``field`` (the i18n
key of the changed attribute); the backend ``activity_logs`` table has no such
column, so it is not emitted here. ``before``/``after`` are the raw JSONB snapshots
recorded by producers (dicts, not the frontend's flattened strings).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ActivityActor(_CamelModel):
    """Who performed the action (frontend ``DirectoryUser`` shape)."""

    id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None = None


class ActivityLogEntry(_CamelModel):
    """One append-only audit entry for a record (newest first)."""

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    actor: ActivityActor
    action: str
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    created_at: datetime


class ActivityFeed(_CamelModel):
    """Per-entity activity list envelope (``{ items: [...] }``)."""

    items: list[ActivityLogEntry]
