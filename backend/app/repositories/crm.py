"""CRM data-access layer.

Holds the SQLAlchemy 2.0 read/query building for companies, contacts and
interactions — including the Membro visibility boundary (BR-002), the derived
"cliente ativo" computation (BR-038) and the archive-blocker probes (BR-062).
Services call these; route handlers never touch the ORM directly.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.crm import Company, Contact, Interaction, Opportunity
from app.models.project import Project, ProjectMember

# Project lifecycle states that count as "live" for the archive block (BR-062).
_ACTIVE_PROJECT_STATUSES = ("planning", "active", "on_hold")
# Relationships that mark a company as a "cliente ativo" (BR-038): a live/won
# link — a won opportunity, or a non-archived project in a working state.
_ACTIVE_CLIENT_PROJECT_STATUSES = ("planning", "active", "on_hold", "completed")


# --------------------------------------------------------------------------- #
# Membro visibility (BR-002)
# --------------------------------------------------------------------------- #
def _membro_visible_company_ids(user_id: uuid.UUID) -> Select[tuple[uuid.UUID | None]]:
    """Company ids a Membro may see: companies linked to a project they are a
    member of. (Ownership is added separately as it is a direct column match.)"""
    return (
        select(Project.company_id)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(
            ProjectMember.user_id == user_id,
            Project.company_id.is_not(None),
        )
    )


def membro_company_filter(user_id: uuid.UUID) -> ColumnElement[bool]:
    """WHERE predicate restricting companies to those a Membro may see (BR-002)."""
    return or_(
        Company.owner_id == user_id,
        Company.id.in_(_membro_visible_company_ids(user_id)),
    )


def membro_contact_filter(user_id: uuid.UUID) -> ColumnElement[bool]:
    """WHERE predicate restricting contacts to those a Membro may see (BR-002):
    contacts they own, or contacts attached to a company they may see."""
    return or_(
        Contact.owner_id == user_id,
        Contact.company_id.in_(
            select(Company.id).where(membro_company_filter(user_id))
        ),
    )


def membro_can_see_company(db: Session, user_id: uuid.UUID, company: Company) -> bool:
    if company.owner_id == user_id:
        return True
    count = db.scalar(
        select(func.count())
        .select_from(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(
            ProjectMember.user_id == user_id,
            Project.company_id == company.id,
        )
    )
    return bool(count and count > 0)


def membro_is_project_member(
    db: Session, user_id: uuid.UUID, project_id: uuid.UUID
) -> bool:
    count = db.scalar(
        select(func.count())
        .select_from(ProjectMember)
        .where(
            ProjectMember.user_id == user_id,
            ProjectMember.project_id == project_id,
        )
    )
    return bool(count and count > 0)


def membro_can_see_contact(db: Session, user_id: uuid.UUID, contact: Contact) -> bool:
    if contact.owner_id == user_id:
        return True
    if contact.company_id is None:
        return False
    company = db.get(Company, contact.company_id)
    return company is not None and membro_can_see_company(db, user_id, company)


# --------------------------------------------------------------------------- #
# Derived "cliente ativo" (BR-038)
# --------------------------------------------------------------------------- #
def active_client_ids(db: Session, company_ids: Sequence[uuid.UUID]) -> set[uuid.UUID]:
    """Subset of ``company_ids`` that have ≥1 active/won relationship (BR-038).

    Computed set-wise (not per row) to avoid an N+1 across list pages.
    """
    if not company_ids:
        return set()

    won = db.execute(
        select(Opportunity.company_id)
        .where(
            Opportunity.company_id.in_(company_ids),
            Opportunity.outcome == "won",
            Opportunity.archived_at.is_(None),
        )
        .distinct()
    ).scalars()

    live = db.execute(
        select(Project.company_id)
        .where(
            Project.company_id.in_(company_ids),
            Project.archived_at.is_(None),
            Project.status.in_(_ACTIVE_CLIENT_PROJECT_STATUSES),
        )
        .distinct()
    ).scalars()

    return {cid for cid in won if cid} | {cid for cid in live if cid}


def is_active_client(db: Session, company_id: uuid.UUID) -> bool:
    return company_id in active_client_ids(db, [company_id])


# --------------------------------------------------------------------------- #
# Archive blockers (BR-062)
# --------------------------------------------------------------------------- #
def archive_blockers(db: Session, company_id: uuid.UUID) -> dict[str, list[str]]:
    """Return the live relationships preventing a company archive (BR-062).

    Empty dict → the company can be archived. Otherwise each key lists the
    offending entity ids: active projects, open opportunities, and won-but-not-
    yet-converted opportunities (H6).
    """
    active_projects = db.execute(
        select(Project.id).where(
            Project.company_id == company_id,
            Project.archived_at.is_(None),
            Project.status.in_(_ACTIVE_PROJECT_STATUSES),
        )
    ).scalars()

    open_opps = db.execute(
        select(Opportunity.id).where(
            Opportunity.company_id == company_id,
            Opportunity.archived_at.is_(None),
            Opportunity.outcome == "open",
        )
    ).scalars()

    # A won opportunity is "converted" once a project references it.
    won_unconverted = db.execute(
        select(Opportunity.id).where(
            Opportunity.company_id == company_id,
            Opportunity.archived_at.is_(None),
            Opportunity.outcome == "won",
            ~select(Project.id)
            .where(Project.opportunity_id == Opportunity.id)
            .exists(),
        )
    ).scalars()

    blockers: dict[str, list[str]] = {}
    if ids := [str(i) for i in active_projects]:
        blockers["active_projects"] = ids
    if ids := [str(i) for i in open_opps]:
        blockers["open_opportunities"] = ids
    if ids := [str(i) for i in won_unconverted]:
        blockers["won_unconverted_opportunities"] = ids
    return blockers


# --------------------------------------------------------------------------- #
# List queries
# --------------------------------------------------------------------------- #
def _paginate(
    db: Session, stmt: Select, *, page: int, page_size: int
) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars()
    )
    return rows, total


def list_companies(
    db: Session,
    *,
    scope_filter: ColumnElement[bool] | None,
    status: str | None,
    sector: str | None,
    owner_id: uuid.UUID | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Company], int]:
    stmt = select(Company)
    conditions: list[ColumnElement[bool]] = []
    if scope_filter is not None:
        conditions.append(scope_filter)
    if not include_archived:
        conditions.append(Company.archived_at.is_(None))
    if status is not None:
        conditions.append(Company.status == status)
    if sector is not None:
        conditions.append(Company.sector == sector)
    if owner_id is not None:
        conditions.append(Company.owner_id == owner_id)
    if q:
        conditions.append(Company.name.ilike(f"%{q}%"))
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(_company_sort(sort))
    return _paginate(db, stmt, page=page, page_size=page_size)


def _company_sort(sort: str):
    mapping = {
        "name": Company.name.asc(),
        "-name": Company.name.desc(),
        "created_at": Company.created_at.asc(),
        "-created_at": Company.created_at.desc(),
    }
    return mapping.get(sort, Company.created_at.desc())


def list_contacts(
    db: Session,
    *,
    scope_filter: ColumnElement[bool] | None,
    status: str | None,
    company_id: uuid.UUID | None,
    owner_id: uuid.UUID | None,
    q: str | None,
    include_archived: bool,
    page: int,
    page_size: int,
) -> tuple[list[Contact], int]:
    stmt = select(Contact)
    conditions: list[ColumnElement[bool]] = []
    if scope_filter is not None:
        conditions.append(scope_filter)
    if not include_archived:
        conditions.append(Contact.archived_at.is_(None))
    if status is not None:
        conditions.append(Contact.status == status)
    if company_id is not None:
        conditions.append(Contact.company_id == company_id)
    if owner_id is not None:
        conditions.append(Contact.owner_id == owner_id)
    if q:
        conditions.append(Contact.name.ilike(f"%{q}%"))
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Contact.name.asc())
    return _paginate(db, stmt, page=page, page_size=page_size)


def membro_interaction_filter(user_id: uuid.UUID) -> ColumnElement[bool]:
    """Interactions a Membro may see (BR-002): ones they authored, ones on a
    company they may see, or ones on a project they are a member of."""
    member_project_ids = select(ProjectMember.project_id).where(
        ProjectMember.user_id == user_id
    )
    return or_(
        Interaction.user_id == user_id,
        Interaction.company_id.in_(
            select(Company.id).where(membro_company_filter(user_id))
        ),
        Interaction.project_id.in_(member_project_ids),
    )


def list_interactions(
    db: Session,
    *,
    scope_filter: ColumnElement[bool] | None,
    company_id: uuid.UUID | None,
    contact_id: uuid.UUID | None,
    opportunity_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    page: int,
    page_size: int,
) -> tuple[list[Interaction], int]:
    stmt = select(Interaction)
    conditions: list[ColumnElement[bool]] = []
    if scope_filter is not None:
        conditions.append(scope_filter)
    if company_id is not None:
        conditions.append(Interaction.company_id == company_id)
    if contact_id is not None:
        conditions.append(Interaction.contact_id == contact_id)
    if opportunity_id is not None:
        conditions.append(Interaction.opportunity_id == opportunity_id)
    if project_id is not None:
        conditions.append(Interaction.project_id == project_id)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Interaction.occurred_at.desc())
    return _paginate(db, stmt, page=page, page_size=page_size)
