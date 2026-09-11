"""User routes: team directory, member detail, own preferences, and the
Admin-only activate / deactivate lifecycle.

Scoping is backend-authoritative (BR-001/002):

* The **directory** and **member detail** are readable by any authenticated user,
  but a Membro receives only the identity slice needed for assignment/mention
  pickers (id/name/role/avatar) — email, status, grants and capacity are withheld.
  Admin/Gestor get the full management fields.
* **Preferences** are strictly own-scoped: the caller reads and writes only their
  own ``user_preferences`` row (the id comes from the token, never the client).
* **activate / deactivate** stay Admin-only (BR-004/005).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireAdmin
from app.core import permissions
from app.database.session import get_db
from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.users import (
    UpdatePreferencesRequest,
    UpdateUserRoleRequest,
    UserDirectory,
    UserDirectoryEntry,
    UserPreferencesResponse,
)
from app.services import user_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


def _to_directory_entry(entry_user: User, *, management: bool) -> UserDirectoryEntry:
    """Serialize a user for the directory, redacting management-only fields for a
    Membro caller (BR-002)."""
    if management:
        return UserDirectoryEntry.model_validate(entry_user)
    # Limited identity slice — everything sensitive stays None.
    return UserDirectoryEntry(
        id=entry_user.id,
        name=entry_user.name,
        role=entry_user.role,
        avatar_url=entry_user.avatar_url,
    )


# --------------------------------------------------------------------------- #
# Own preferences — declared before /{user_id} so "me" is never captured
# --------------------------------------------------------------------------- #
@router.get("/me/preferences", response_model=UserPreferencesResponse)
def get_my_preferences(
    user: CurrentUser, db: DbSession
) -> UserPreferencesResponse:
    """The caller's own theme / locale / notification-channel preferences."""
    prefs = user_service.get_or_create_preferences(db, user)
    return UserPreferencesResponse.model_validate(prefs)


@router.patch("/me/preferences", response_model=UserPreferencesResponse)
def update_my_preferences(
    payload: UpdatePreferencesRequest, user: CurrentUser, db: DbSession
) -> UserPreferencesResponse:
    """Patch the caller's own preferences (only provided fields are written)."""
    prefs = user_service.update_preferences(
        db,
        user,
        theme=payload.theme,
        locale=payload.locale,
        notification_channels=payload.notification_channels,
    )
    return UserPreferencesResponse.model_validate(prefs)


# --------------------------------------------------------------------------- #
# Directory
# --------------------------------------------------------------------------- #
@router.get("", response_model=UserDirectory)
def list_users(
    user: CurrentUser,
    db: DbSession,
    include_inactive: Annotated[bool, Query()] = False,
) -> UserDirectory:
    """Team directory. Admin/Gestor see full member fields; a Membro sees only
    the identity slice for assignment pickers. ``include_inactive`` is honoured
    for management callers only (a Membro always gets the active roster)."""
    management = permissions.role_at_least(user.role, permissions.Role.GESTOR)
    users = user_service.list_directory(
        db, include_inactive=include_inactive and management
    )
    return UserDirectory(
        items=[_to_directory_entry(u, management=management) for u in users]
    )


@router.get("/{user_id}", response_model=UserDirectoryEntry)
def get_user(
    user_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> UserDirectoryEntry:
    """One member's directory card, redacted for a Membro caller (BR-002)."""
    management = permissions.role_at_least(user.role, permissions.Role.GESTOR)
    target = user_service.get_user_or_404(db, user_id)
    return _to_directory_entry(target, management=management)


# --------------------------------------------------------------------------- #
# Lifecycle (Admin only)
# --------------------------------------------------------------------------- #
@router.post("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: uuid.UUID,
    _admin: RequireAdmin,
    db: DbSession,
) -> UserResponse:
    user = user_service.deactivate_user(db, user_id)
    return UserResponse.model_validate(user)


@router.post("/{user_id}/activate", response_model=UserResponse)
def activate_user(
    user_id: uuid.UUID,
    _admin: RequireAdmin,
    db: DbSession,
) -> UserResponse:
    user = user_service.activate_user(db, user_id)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: uuid.UUID,
    payload: UpdateUserRoleRequest,
    _admin: RequireAdmin,
    db: DbSession,
) -> UserResponse:
    """Audit H15 — Admin-only role change (matrix §3, BR-004/005)."""
    user = user_service.update_user_role(db, user_id, payload.role)
    return UserResponse.model_validate(user)
