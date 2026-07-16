"""Role model and authorization primitives (WORKFLOW_SPEC §3, BR-001..003).

Foundation-level definitions. Endpoint-level enforcement lands with the API
issues; the matrix here is the single source of truth for role checks.
"""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    GESTOR = "gestor"
    MEMBRO = "membro"


# Admin ⊃ Gestor(+grants) ⊃ Membro, enforced via explicit checks, not inheritance.
ROLE_ORDER: dict[str, int] = {Role.MEMBRO: 0, Role.GESTOR: 1, Role.ADMIN: 2}


def role_at_least(role: str, minimum: Role) -> bool:
    return ROLE_ORDER.get(role, -1) >= ROLE_ORDER[minimum]


def can_access_financials(role: str, payments_grant: bool) -> bool:
    """BR-008 / BR-066: Admin always; Gestor only with explicit grant; Membro never."""
    if role == Role.ADMIN:
        return True
    if role == Role.GESTOR:
        return payments_grant
    return False


def can_invite(role: str, invites_grant: bool) -> bool:
    """BR-003/BR-007: Admin always; Gestor only with explicit grant; Membro never."""
    if role == Role.ADMIN:
        return True
    if role == Role.GESTOR:
        return invites_grant
    return False
