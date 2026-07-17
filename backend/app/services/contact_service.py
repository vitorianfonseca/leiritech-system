"""Contact business logic (CRM F4).

Mirrors ``company_service``: scoped reads (BR-002), soft-delete only (BR-060),
audit trail (BR-064). Contacts have no archive-blocker rule.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import Role, role_at_least
from app.models.crm import Company, Contact
from app.models.user import User
from app.repositories import crm as crm_repo
from app.schemas.crm import ContactCreate, ContactUpdate
from app.services import activity_service

logger = structlog.get_logger("aurea.crm.contact")

ENTITY_TYPE = "contact"

_SNAPSHOT_FIELDS = (
    "name",
    "company_id",
    "role_title",
    "email",
    "phone",
    "notes",
    "owner_id",
    "status",
    "photo_url",
)


def _snapshot(contact: Contact) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in _SNAPSHOT_FIELDS:
        value = getattr(contact, field)
        out[field] = str(value) if isinstance(value, uuid.UUID) else value
    return out


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


def _validate_company(db: Session, company_id: uuid.UUID | None) -> None:
    if company_id is not None and db.get(Company, company_id) is None:
        raise errors.not_found(
            "Empresa associada não encontrada.", code="COMPANY_NOT_FOUND"
        )


def get_contact_or_404(db: Session, user: User, contact_id: uuid.UUID) -> Contact:
    contact = db.get(Contact, contact_id)
    if contact is None:
        raise errors.not_found("Contacto não encontrado.", code="CONTACT_NOT_FOUND")
    if _is_membro(user) and not crm_repo.membro_can_see_contact(db, user.id, contact):
        raise errors.not_found("Contacto não encontrado.", code="CONTACT_NOT_FOUND")
    return contact


def list_contacts(
    db: Session,
    user: User,
    *,
    status: str | None,
    company_id: uuid.UUID | None,
    owner_id: uuid.UUID | None,
    q: str | None,
    include_archived: bool,
    page: int,
    page_size: int,
) -> tuple[list[Contact], int]:
    scope_filter = (
        crm_repo.membro_contact_filter(user.id) if _is_membro(user) else None
    )
    return crm_repo.list_contacts(
        db,
        scope_filter=scope_filter,
        status=status,
        company_id=company_id,
        owner_id=owner_id,
        q=q,
        include_archived=include_archived,
        page=page,
        page_size=page_size,
    )


def create_contact(db: Session, user: User, payload: ContactCreate) -> Contact:
    _validate_company(db, payload.company_id)
    contact = Contact(
        name=payload.name,
        company_id=payload.company_id,
        photo_url=payload.photo_url,
        role_title=payload.role_title,
        email=payload.email,
        phone=payload.phone,
        notes=payload.notes,
        owner_id=payload.owner_id,
        status=payload.status,
        created_by=user.id,
    )
    db.add(contact)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=contact.id,
        action="contact.created",
        actor_id=user.id,
        after=_snapshot(contact),
    )
    logger.info("contact_created", contact_id=str(contact.id), actor_id=str(user.id))
    return contact


def update_contact(
    db: Session, user: User, contact_id: uuid.UUID, payload: ContactUpdate
) -> Contact:
    contact = get_contact_or_404(db, user, contact_id)
    changes = payload.model_dump(exclude_unset=True)
    if "company_id" in changes:
        _validate_company(db, changes["company_id"])
    before = _snapshot(contact)
    for field, value in changes.items():
        setattr(contact, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=contact.id,
        action="contact.updated",
        actor_id=user.id,
        before=before,
        after=_snapshot(contact),
    )
    logger.info(
        "contact_updated",
        contact_id=str(contact.id),
        actor_id=str(user.id),
        fields=sorted(changes.keys()),
    )
    return contact


def _assert_can_manage(user: User, contact: Contact) -> None:
    if user.role == Role.ADMIN:
        return
    if user.role == Role.GESTOR and contact.owner_id == user.id:
        return
    raise errors.forbidden(
        "Só pode arquivar contactos de que é responsável.",
        code="CONTACT_MANAGE_FORBIDDEN",
    )


def archive_contact(db: Session, user: User, contact_id: uuid.UUID) -> Contact:
    contact = get_contact_or_404(db, user, contact_id)
    _assert_can_manage(user, contact)
    if contact.archived_at is None:
        contact.archived_at = datetime.now(tz=UTC)
        db.flush()
        activity_service.record(
            db,
            entity_type=ENTITY_TYPE,
            entity_id=contact.id,
            action="contact.archived",
            actor_id=user.id,
        )
        logger.info(
            "contact_archived", contact_id=str(contact.id), actor_id=str(user.id)
        )
    return contact


def restore_contact(db: Session, user: User, contact_id: uuid.UUID) -> Contact:
    contact = db.get(Contact, contact_id)
    if contact is None:
        raise errors.not_found("Contacto não encontrado.", code="CONTACT_NOT_FOUND")
    _assert_can_manage(user, contact)
    if contact.archived_at is not None:
        contact.archived_at = None
        db.flush()
        activity_service.record(
            db,
            entity_type=ENTITY_TYPE,
            entity_id=contact.id,
            action="contact.restored",
            actor_id=user.id,
        )
        logger.info(
            "contact_restored", contact_id=str(contact.id), actor_id=str(user.id)
        )
    return contact
