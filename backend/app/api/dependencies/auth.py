"""Auth & authorization dependencies — the request-time enforcement layer.

``get_current_user`` decodes the access token and loads the live ``User`` row on
every request, so a deactivated user's tokens stop working immediately (they are
not trusted from the token payload alone). Role gates and resource scoping build
on the pure predicates in ``app.core.permissions`` (BR-001: backend-authoritative).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core import errors, permissions
from app.core.permissions import Role
from app.database.session import get_db
from app.models.user import User

# auto_error=False so we render the project's error envelope instead of FastAPI's
# default {"detail": ...} on a missing/invalid Authorization header.
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer)
    ] = None,
) -> User:
    if credentials is None:
        raise errors.unauthorized(
            "Autenticação necessária.", code="NOT_AUTHENTICATED"
        )

    from app.core import security  # local import avoids a heavy module at import time

    try:
        payload = security.decode_access_token(credentials.credentials)
    except Exception as exc:  # noqa: BLE001 — any decode/type failure is a 401
        raise errors.unauthorized(
            "Sessão inválida ou expirada.", code="INVALID_ACCESS_TOKEN"
        ) from exc

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise errors.unauthorized(
            "Sessão inválida.", code="INVALID_ACCESS_TOKEN"
        ) from exc

    user = db.get(User, user_id)
    if user is None:
        raise errors.unauthorized("Sessão inválida.", code="INVALID_ACCESS_TOKEN")
    if user.status != "active":
        raise errors.unauthorized(
            "Conta desativada. Contacte um Administrador.",
            code="ACCOUNT_DEACTIVATED",
        )

    request.state.user = user
    return user


# ``get_current_user`` already rejects deactivated accounts; this alias exists so
# route signatures can read intent explicitly and to keep a seam for future
# "must have verified X" refinements.
def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    return user


CurrentUser = Annotated[User, Depends(get_current_active_user)]


def scoped_or_404(user: User, *, is_member: bool, is_owner: bool = False) -> None:
    """Enforce the Membro visibility boundary (BR-002).

    Returns cleanly if the user may view the resource; otherwise raises **404**
    (not 403) so a Membro cannot enumerate the existence of records they are not
    a member of. Resource endpoints in later issues call this after loading the
    row and resolving membership/ownership.
    """
    if permissions.can_view_project(user, is_member=is_member, is_owner=is_owner):
        return
    raise errors.not_found()


def require_role(minimum: Role):
    """Dependency factory: require at least ``minimum`` role (BR-001)."""

    def _dep(user: CurrentUser) -> User:
        if not permissions.role_at_least(user.role, minimum):
            raise errors.forbidden(code="INSUFFICIENT_ROLE")
        return user

    return _dep


def require_admin(user: CurrentUser) -> User:
    if not permissions.is_admin(user):
        raise errors.forbidden(code="ADMIN_REQUIRED")
    return user


def require_gestor(user: CurrentUser) -> User:
    if not permissions.role_at_least(user.role, Role.GESTOR):
        raise errors.forbidden(code="GESTOR_REQUIRED")
    return user


def require_invite_capability(user: CurrentUser) -> User:
    """Admin, or Gestor with the invite grant (BR-003)."""
    if not permissions.can_manage_invitations(user):
        raise errors.forbidden(
            "Não tem permissão para convidar utilizadores.",
            code="INVITE_NOT_PERMITTED",
        )
    return user


def require_finance_capability(user: CurrentUser) -> User:
    """Financial data gate (BR-008): Admin always, Gestor only with the payments
    grant, Membro never. Enforced backend-side on every finance endpoint."""
    if not permissions.can_manage_financials(user):
        raise errors.forbidden(
            "Não tem permissão para aceder a dados financeiros.",
            code="FINANCE_NOT_PERMITTED",
        )
    return user


RequireAdmin = Annotated[User, Depends(require_admin)]
RequireGestor = Annotated[User, Depends(require_gestor)]
RequireInviteCapability = Annotated[User, Depends(require_invite_capability)]
RequireFinance = Annotated[User, Depends(require_finance_capability)]
