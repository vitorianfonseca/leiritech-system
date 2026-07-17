"""Company business logic (CRM F4).

All company mutations flow through here so the archive block (BR-062), the
derived "cliente ativo" flag (BR-038), the Membro visibility boundary (BR-002)
and the audit trail (BR-064) are enforced in exactly one place. Route handlers
stay thin: authenticate, delegate, serialize.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import Role, role_at_least
from app.models.crm import Company
from app.models.user import User
from app.repositories import crm as crm_repo
from app.schemas.crm import CompanyCreate, CompanyUpdate
from app.services import activity_service

logger = structlog.get_logger("aurea.crm.company")

ENTITY_TYPE = "company"

# Columns captured in audit before/after snapshots.
_SNAPSHOT_FIELDS = (
    "name",
    "sector",
    "website",
    "email",
    "phone",
    "address",
    "description",
    "source",
    "owner_id",
    "status",
    "logo_url",
)


def _snapshot(company: Company) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in _SNAPSHOT_FIELDS:
        value = getattr(company, field)
        out[field] = str(value) if isinstance(value, uuid.UUID) else value
    return out


def _hydrate(db: Session, company: Company) -> Company:
    """Attach the derived ``is_active_client`` flag (BR-038) for serialization."""
    company.is_active_client = crm_repo.is_active_client(db, company.id)
    return company


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


def get_company_or_404(db: Session, user: User, company_id: uuid.UUID) -> Company:
    """Load a company, enforcing the Membro visibility boundary.

    A Membro requesting a company outside their scope gets 404 (not 403) so they
    cannot enumerate records they are not a member of (BR-002).
    """
    company = db.get(Company, company_id)
    if company is None:
        raise errors.not_found("Empresa não encontrada.", code="COMPANY_NOT_FOUND")
    if _is_membro(user) and not crm_repo.membro_can_see_company(db, user.id, company):
        raise errors.not_found("Empresa não encontrada.", code="COMPANY_NOT_FOUND")
    return _hydrate(db, company)


def list_companies(
    db: Session,
    user: User,
    *,
    status: str | None,
    sector: str | None,
    owner_id: uuid.UUID | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Company], int]:
    scope_filter = (
        crm_repo.membro_company_filter(user.id) if _is_membro(user) else None
    )
    companies, total = crm_repo.list_companies(
        db,
        scope_filter=scope_filter,
        status=status,
        sector=sector,
        owner_id=owner_id,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    active = crm_repo.active_client_ids(db, [c.id for c in companies])
    for company in companies:
        company.is_active_client = company.id in active
    return companies, total


def create_company(db: Session, user: User, payload: CompanyCreate) -> Company:
    company = Company(
        name=payload.name,
        logo_url=payload.logo_url,
        sector=payload.sector,
        website=payload.website,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        description=payload.description,
        source=payload.source,
        owner_id=payload.owner_id,
        status=payload.status,
        created_by=user.id,
    )
    db.add(company)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=company.id,
        action="company.created",
        actor_id=user.id,
        after=_snapshot(company),
    )
    logger.info("company_created", company_id=str(company.id), actor_id=str(user.id))
    return _hydrate(db, company)


def update_company(
    db: Session, user: User, company_id: uuid.UUID, payload: CompanyUpdate
) -> Company:
    company = get_company_or_404(db, user, company_id)
    before = _snapshot(company)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(company, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=company.id,
        action="company.updated",
        actor_id=user.id,
        before=before,
        after=_snapshot(company),
    )
    logger.info(
        "company_updated",
        company_id=str(company.id),
        actor_id=str(user.id),
        fields=sorted(changes.keys()),
    )
    return _hydrate(db, company)


def _assert_can_manage(user: User, company: Company) -> None:
    """Archive/restore: Admin any; Gestor only companies they own (matrix §3)."""
    if user.role == Role.ADMIN:
        return
    if user.role == Role.GESTOR and company.owner_id == user.id:
        return
    raise errors.forbidden(
        "Só pode arquivar empresas de que é responsável.",
        code="COMPANY_MANAGE_FORBIDDEN",
    )


def archive_company(db: Session, user: User, company_id: uuid.UUID) -> Company:
    """Soft-delete a company (BR-060), blocked by live relationships (BR-062)."""
    company = get_company_or_404(db, user, company_id)
    _assert_can_manage(user, company)

    if company.archived_at is not None:
        return _hydrate(db, company)  # idempotent

    blockers = crm_repo.archive_blockers(db, company.id)
    if blockers:
        raise errors.ApiError(
            status_code=409,
            code="COMPANY_ARCHIVE_BLOCKED",
            message=(
                "Não é possível arquivar: existem projetos ativos ou "
                "oportunidades por resolver."
            ),
            details={"blockers": blockers},
        )

    company.archived_at = datetime.now(tz=UTC)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=company.id,
        action="company.archived",
        actor_id=user.id,
    )
    logger.info("company_archived", company_id=str(company.id), actor_id=str(user.id))
    return _hydrate(db, company)


def restore_company(db: Session, user: User, company_id: uuid.UUID) -> Company:
    company = db.get(Company, company_id)
    if company is None:
        raise errors.not_found("Empresa não encontrada.", code="COMPANY_NOT_FOUND")
    _assert_can_manage(user, company)
    if company.archived_at is not None:
        company.archived_at = None
        db.flush()
        activity_service.record(
            db,
            entity_type=ENTITY_TYPE,
            entity_id=company.id,
            action="company.restored",
            actor_id=user.id,
        )
        logger.info(
            "company_restored", company_id=str(company.id), actor_id=str(user.id)
        )
    return _hydrate(db, company)
