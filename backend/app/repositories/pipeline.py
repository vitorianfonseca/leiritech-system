"""Pipeline / opportunity data-access layer (F5/F7).

SQLAlchemy 2.0 (sync ``Session``) read/query building for pipeline stages and
opportunities, including the Membro visibility boundary (BR-002). Services call
these; route handlers never touch the ORM directly. The Membro boundary reuses
``repositories.crm.membro_company_filter`` so "which companies can I see" lives
in exactly one place.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.crm import Company, Contact, Opportunity, PipelineStage, Proposal
from app.repositories.crm import membro_company_filter


# --------------------------------------------------------------------------- #
# Membro visibility (BR-002)
# --------------------------------------------------------------------------- #
def membro_opportunity_filter(user_id: uuid.UUID) -> ColumnElement[bool]:
    """WHERE predicate restricting opportunities to those a Membro may see
    (BR-002): ones they own, or ones attached to a company they may see."""
    return or_(
        Opportunity.owner_id == user_id,
        Opportunity.company_id.in_(
            select(Company.id).where(membro_company_filter(user_id))
        ),
    )


def membro_can_see_opportunity(
    db: Session, user_id: uuid.UUID, opportunity: Opportunity
) -> bool:
    if opportunity.owner_id == user_id:
        return True
    if opportunity.company_id is None:
        return False
    return bool(
        db.scalar(
            select(func.count())
            .select_from(Company)
            .where(Company.id == opportunity.company_id, membro_company_filter(user_id))
        )
    )


# --------------------------------------------------------------------------- #
# Pipeline stages
# --------------------------------------------------------------------------- #
def list_stages(db: Session) -> list[PipelineStage]:
    return list(
        db.execute(
            select(PipelineStage).order_by(
                PipelineStage.order_index.asc(), PipelineStage.name.asc()
            )
        ).scalars()
    )


def get_stage_by_code(db: Session, code: str) -> PipelineStage | None:
    return db.scalar(select(PipelineStage).where(PipelineStage.code == code))


# --------------------------------------------------------------------------- #
# Opportunities
# --------------------------------------------------------------------------- #
def _paginate(
    db: Session, stmt: Select, *, page: int, page_size: int
) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars()
    )
    return rows, total


def _opportunity_sort(sort: str):
    mapping = {
        "title": Opportunity.title.asc(),
        "-title": Opportunity.title.desc(),
        "created_at": Opportunity.created_at.asc(),
        "-created_at": Opportunity.created_at.desc(),
        "expected_close_date": Opportunity.expected_close_date.asc(),
        "-expected_close_date": Opportunity.expected_close_date.desc(),
    }
    return mapping.get(sort, Opportunity.created_at.desc())


def list_opportunities(
    db: Session,
    *,
    scope_filter: ColumnElement[bool] | None,
    stage_id: uuid.UUID | None,
    company_id: uuid.UUID | None,
    owner_id: uuid.UUID | None,
    outcome: str | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Opportunity], int]:
    stmt = select(Opportunity)
    conditions: list[ColumnElement[bool]] = []
    if scope_filter is not None:
        conditions.append(scope_filter)
    if not include_archived:
        conditions.append(Opportunity.archived_at.is_(None))
    if stage_id is not None:
        conditions.append(Opportunity.stage_id == stage_id)
    if company_id is not None:
        conditions.append(Opportunity.company_id == company_id)
    if owner_id is not None:
        conditions.append(Opportunity.owner_id == owner_id)
    if outcome is not None:
        conditions.append(Opportunity.outcome == outcome)
    if q:
        conditions.append(Opportunity.title.ilike(f"%{q}%"))
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(_opportunity_sort(sort))
    return _paginate(db, stmt, page=page, page_size=page_size)


# --------------------------------------------------------------------------- #
# Won → project handoff (F7)
# --------------------------------------------------------------------------- #
def company_contacts(db: Session, company_id: uuid.UUID) -> list[Contact]:
    return list(
        db.execute(
            select(Contact)
            .where(Contact.company_id == company_id, Contact.archived_at.is_(None))
            .order_by(Contact.name.asc())
        ).scalars()
    )


def accepted_proposal(db: Session, opportunity_id: uuid.UUID) -> Proposal | None:
    """Most recent accepted proposal for an opportunity, if any (BR-035)."""
    return db.scalar(
        select(Proposal)
        .where(
            Proposal.opportunity_id == opportunity_id,
            Proposal.status == "accepted",
            Proposal.archived_at.is_(None),
        )
        .order_by(Proposal.created_at.desc())
        .limit(1)
    )
