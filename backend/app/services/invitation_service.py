"""Invitation service: create tokenized invites and accept them (§1.10).

There is no public signup (BR-007); accounts are created only by accepting an
invitation issued by an Admin (or a Gestor with the invite grant, BR-003).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import errors, security
from app.core.config import settings
from app.models.user import Invitation, User
from app.schemas.auth import InvitationAccept, InvitationCreate
from app.services.email_service import email_service

logger = structlog.get_logger("leiritech.invitations")


def _now() -> datetime:
    return datetime.now(tz=UTC)


def create_invitation(
    db: Session, payload: InvitationCreate, *, invited_by: User
) -> tuple[Invitation, str]:
    """Create a pending invitation and dispatch the email. Returns (invite, raw_token)."""
    email = payload.email.lower()
    role = str(payload.role)

    # Only an Administrador may grant elevated roles (BR-004: only Admin manages
    # roles). A Gestor with the invite grant can create MEMBRO accounts only —
    # otherwise a non-admin could self-escalate by inviting a new admin/gestor.
    if invited_by.role != "admin" and role != "membro":
        raise errors.forbidden(
            "Apenas um Administrador pode convidar com este perfil.",
            code="INVITE_ROLE_NOT_PERMITTED",
        )

    existing_user = db.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()
    if existing_user is not None:
        raise errors.conflict(
            "Já existe um utilizador com este email.", code="EMAIL_TAKEN"
        )

    # Revoke any still-pending invite for the same email before issuing a new one.
    pending = db.execute(
        select(Invitation).where(
            Invitation.email == email, Invitation.status == "pending"
        )
    ).scalars().all()
    for old in pending:
        old.status = "revoked"

    raw_token = security.generate_url_token()
    invite = Invitation(
        email=email,
        role=str(payload.role),
        token_hash=security.hash_token(raw_token),
        status="pending",
        expires_at=_now() + timedelta(seconds=settings.INVITATION_TTL),
        invited_by=invited_by.id,
    )
    db.add(invite)
    db.flush()

    accept_link = f"{settings.FRONTEND_URL}/accept-invite?token={raw_token}"
    email_service.send_invitation(
        to=email, accept_link=accept_link, role=str(payload.role)
    )
    logger.info(
        "invitation_created",
        invitation_id=str(invite.id),
        invited_by=str(invited_by.id),
        role=str(payload.role),
    )
    return invite, raw_token


def get_invitation_by_token(db: Session, token: str) -> tuple[Invitation, str]:
    """Resolve a raw invite token to its (still-valid) invitation for the public
    accept screen. Returns ``(invitation, inviter_name)``.

    Mirrors the acceptance guards so the metadata read and the accept POST agree:
    an unknown token is **404** (never existed / wrong token — enumeration-safe),
    while a token that existed but is spent (accepted/revoked/expired) is **410**
    (gone). The token is matched by hash — the raw token never touches the DB.
    """
    invite = db.execute(
        select(Invitation).where(
            Invitation.token_hash == security.hash_token(token)
        )
    ).scalar_one_or_none()

    if invite is None:
        raise errors.not_found(
            "Convite inválido ou expirado. Peça um novo convite.",
            code="INVALID_INVITATION",
        )
    if invite.status == "accepted":
        raise errors.gone(
            "Convite já aceite. Inicie sessão para continuar.",
            code="INVITATION_ALREADY_ACCEPTED",
        )
    if invite.status == "revoked":
        raise errors.gone(
            "Este convite foi revogado.", code="INVITATION_REVOKED"
        )
    if invite.status == "expired" or invite.expires_at <= _now():
        raise errors.gone(
            "Convite expirado. Peça um novo convite.", code="INVITATION_EXPIRED"
        )

    inviter_name = ""
    if invite.invited_by is not None:
        inviter = db.get(User, invite.invited_by)
        if inviter is not None:
            inviter_name = inviter.name
    return invite, inviter_name


def accept_invitation(db: Session, payload: InvitationAccept) -> User:
    """Consume a valid invitation token: create + activate the user (§1.10)."""
    invite = db.execute(
        select(Invitation).where(
            Invitation.token_hash == security.hash_token(payload.token)
        )
    ).scalar_one_or_none()

    if invite is None:
        raise errors.bad_request(
            "Convite inválido ou expirado. Peça um novo convite.",
            code="INVALID_INVITATION",
        )
    if invite.status == "accepted":
        raise errors.conflict(
            "Convite já aceite. Faça a gestão pelo utilizador.",
            code="INVITATION_ALREADY_ACCEPTED",
        )
    if invite.status == "revoked":
        raise errors.bad_request(
            "Este convite foi revogado.", code="INVITATION_REVOKED"
        )
    if invite.status == "expired" or invite.expires_at <= _now():
        invite.status = "expired"
        raise errors.bad_request(
            "Convite inválido ou expirado. Peça um novo convite.",
            code="INVITATION_EXPIRED",
        )

    # Guard against a race where the email was registered after the invite.
    if db.execute(
        select(User).where(User.email == invite.email)
    ).scalar_one_or_none() is not None:
        raise errors.conflict(
            "Já existe um utilizador com este email.", code="EMAIL_TAKEN"
        )

    user = User(
        name=payload.name,
        email=invite.email,
        password_hash=security.hash_password(payload.password),
        role=invite.role,
        status="active",
        # Gestor grants (payments/invites) start False; an admin assigns them
        # on the user account afterwards (BR-003).
        payments_grant=False,
        invites_grant=False,
    )
    try:
        with db.begin_nested():
            db.add(user)
            invite.status = "accepted"
            invite.accepted_at = _now()
            db.flush()
    except IntegrityError as exc:
        # Lost the race on the email unique constraint (audit H18) → 409, not a
        # 500; the invite stays pending/unaccepted since the whole savepoint
        # rolls back together.
        raise errors.conflict(
            "Já existe um utilizador com este email.", code="EMAIL_TAKEN"
        ) from exc
    logger.info(
        "invitation_accepted",
        invitation_id=str(invite.id),
        user_id=str(user.id),
    )
    return user
