"""User directory + per-user preferences schemas.

Two contracts live here:

* **Directory** (``GET /users``) — the team directory the settings members table
  (`frontend/src/lib/api/settings-types.ts`), the workload rows (`team-types.ts`)
  and the assignment/mention pickers read. It is role-scoped in the route: an
  Admin/Gestor sees the full management fields (email, status, grants, capacity),
  while a Membro sees only the identity slice needed to pick assignees
  (id/name/role/avatar) — the sensitive fields come back ``null`` (BR-002).
* **Preferences** (``GET/PATCH /users/me/preferences``) — the caller's own
  ``user_preferences`` row (theme / locale / per-channel notification prefs),
  mapped to `frontend/src/lib/api/profile-types.ts` ``UserPreferences``.

Field names are snake_case (matching the sibling ``schemas.auth.UserResponse``);
the frontend HTTP client deep-maps snake_case responses to camelCase, so the wire
shape the TS contract sees is identical either way.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class UserDirectoryEntry(BaseModel):
    """One user in the team directory.

    The management-only fields are ``Optional`` because they are withheld (set to
    ``None``) for a Membro caller, whose directory is limited to the identity
    fields needed for assignment/mention pickers.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str
    avatar_url: str | None = None
    # Management-only (None in a Membro's limited directory).
    email: str | None = None
    status: str | None = None
    payments_grant: bool | None = None
    invites_grant: bool | None = None
    weekly_capacity_hours: float | None = None
    last_login_at: datetime | None = None


class UserDirectory(BaseModel):
    """Directory list envelope (``{ items: [...] }``)."""

    items: list[UserDirectoryEntry]


class UserPreferencesResponse(BaseModel):
    """The caller's own preferences (theme / locale / notification channels)."""

    model_config = ConfigDict(from_attributes=True)

    theme: str
    locale: str
    # Free-form per-category channel map (mentions/taskAssigned/... → {inApp,email}).
    # Stored verbatim as JSONB; the frontend owns the vocabulary.
    notification_channels: dict[str, Any] = Field(default_factory=dict)


class UpdateUserRoleRequest(BaseModel):
    """Admin-only role change (audit H15). ``role`` is one of the three
    authoritative roles (BR-001); anything else is rejected at the edge."""

    role: Literal["admin", "gestor", "membro"]


class UpdatePreferencesRequest(BaseModel):
    """Partial update of the caller's own preferences. Every field is optional;
    only the provided ones are written."""

    # Wire format is snake_case: the frontend HTTP client deep-converts camelCase
    # request bodies to snake_case before sending (``keysToSnake``), so the body
    # arriving here is already snake_case.
    theme: Literal["light", "dark", "system"] | None = None
    locale: str | None = Field(default=None, min_length=2, max_length=10)
    notification_channels: dict[str, Any] | None = None
