"""Role model and the single authoritative authorization layer.

WORKFLOW_SPEC §3 permission matrix + BR-001..008. This module is the ONE place
role/scope decisions are made; there are no per-project or custom permissions.
Every function here is a pure predicate over already-loaded data (role, grant
flags, and membership/ownership booleans the caller resolves from the DB), which
keeps the access model fully unit-testable without a database.

Enforcement is ALWAYS backend-side; the frontend role is never trusted (BR-001).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Protocol


class Role(StrEnum):
    ADMIN = "admin"
    GESTOR = "gestor"
    MEMBRO = "membro"


# Admin ⊃ Gestor(+grants) ⊃ Membro, enforced via explicit checks, not inheritance.
ROLE_ORDER: dict[str, int] = {Role.MEMBRO: 0, Role.GESTOR: 1, Role.ADMIN: 2}


class UserLike(Protocol):
    """Structural view of the fields authorization depends on.

    Lets the predicates run against the ``User`` ORM object (or any test double)
    without importing the models layer, avoiding an import cycle.
    """

    role: str
    status: str
    payments_grant: bool
    invites_grant: bool


# --------------------------------------------------------------------------- #
# Role primitives
# --------------------------------------------------------------------------- #
def role_at_least(role: str, minimum: Role) -> bool:
    return ROLE_ORDER.get(role, -1) >= ROLE_ORDER[minimum]


def is_admin(user: UserLike) -> bool:
    return user.role == Role.ADMIN


def is_active(user: UserLike) -> bool:
    return user.status == "active"


# --------------------------------------------------------------------------- #
# Grant-gated capabilities (BR-003, BR-007, BR-008)
# --------------------------------------------------------------------------- #
def can_access_financials(role: str, payments_grant: bool) -> bool:
    """BR-008: Admin always; Gestor only with explicit grant; Membro never."""
    if role == Role.ADMIN:
        return True
    if role == Role.GESTOR:
        return payments_grant
    return False


def can_manage_financials(user: UserLike) -> bool:
    """BR-008 — view/create/edit financial data. Membro is never permitted."""
    return can_access_financials(user.role, user.payments_grant)


def can_invite(role: str, invites_grant: bool) -> bool:
    """BR-003/BR-007: Admin always; Gestor only with explicit grant; Membro never."""
    if role == Role.ADMIN:
        return True
    if role == Role.GESTOR:
        return invites_grant
    return False


def can_manage_invitations(user: UserLike) -> bool:
    return can_invite(user.role, user.invites_grant)


def can_manage_users(user: UserLike) -> bool:
    """Activate/deactivate/manage roles — Admin only (matrix §3, BR-004/BR-005)."""
    return user.role == Role.ADMIN


# --------------------------------------------------------------------------- #
# Resource-scoped checks (BR-002 horizontal-access boundary).
# ``is_member`` / ``is_owner`` are resolved by the caller from project_members /
# manager_id and passed in. For a Membro, a resource they cannot see must yield
# 404 (not 403) to avoid enumeration — see ``dependencies.auth.scoped_or_404``.
# --------------------------------------------------------------------------- #
def can_view_project(user: UserLike, *, is_member: bool, is_owner: bool = False) -> bool:
    """View a project. Admin/Gestor: all. Membro: only member or owned (BR-002)."""
    if role_at_least(user.role, Role.GESTOR):
        return True
    return is_member or is_owner


def can_manage_project(user: UserLike, *, is_owner: bool) -> bool:
    """Lifecycle state, members, published health. Admin: all; Gestor: owner only."""
    if user.role == Role.ADMIN:
        return True
    if user.role == Role.GESTOR:
        return is_owner
    return False


def can_edit_task(
    user: UserLike, *, is_member: bool, is_owner: bool = False
) -> bool:
    """Create/edit a task (H7).

    Admin: all. Gestor: projects they own or are a member of. Membro: ONLY on
    projects where they are a project_member (H7/BR-002).
    """
    if user.role == Role.ADMIN:
        return True
    if user.role == Role.GESTOR:
        return is_member or is_owner
    if user.role == Role.MEMBRO:
        return is_member
    return False


def can_transition_task(user: UserLike, *, is_assignee: bool, is_member: bool) -> bool:
    """Move an assigned task up to ``em revisão``. Membro: only own assigned task."""
    if role_at_least(user.role, Role.GESTOR):
        return True
    return is_assignee and is_member


def can_approve_task(user: UserLike, *, is_project_manager: bool = False) -> bool:
    """Approve ``em revisão`` → ``concluída`` (C3).

    Gestor+/Admin ONLY. A Membro can never self-approve.
    """
    if user.role == Role.ADMIN:
        return True
    if user.role == Role.GESTOR:
        return is_project_manager
    return False
