"""Global search schemas (F18).

Typed, grouped response for the cross-entity search endpoint. Each hit carries a
stable ``type`` + ``id`` pair the frontend turns into a link, a human ``label``
and an optional ``sublabel`` for context. Results are grouped by entity type and
ordered within a group by trigram similarity (best matches first).
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class SearchHit(BaseModel):
    """A single matched entity."""

    model_config = ConfigDict(from_attributes=True)

    type: str  # singular entity type, e.g. "company", "project"
    id: uuid.UUID
    label: str
    sublabel: str | None = None


class SearchGroup(BaseModel):
    """A group of hits of one entity type."""

    type: str  # plural group key, e.g. "companies", "projects"
    count: int  # number of hits returned in this group
    items: list[SearchHit]


class SearchResponse(BaseModel):
    """Grouped global-search result envelope (F18)."""

    query: str
    groups: list[SearchGroup]
