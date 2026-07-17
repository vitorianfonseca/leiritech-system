"""Shared schema primitives reused across feature routers.

The ``Page`` envelope is the canonical list-response shape (``{items, total,
page, page_size}``). Establish it here so every paginated endpoint added later
returns an identical structure clients can rely on.
"""

from __future__ import annotations

from pydantic import BaseModel


class Page[T](BaseModel):
    """Uniform pagination envelope for list endpoints."""

    items: list[T]
    total: int
    page: int
    page_size: int
