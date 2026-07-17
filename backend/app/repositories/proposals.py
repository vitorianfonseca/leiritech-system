"""Proposal data-access layer (F6).

SQLAlchemy 2.0 (sync ``Session``) query building for proposals, including the
Membro visibility boundary (BR-002). Services call these; route handlers never
touch the ORM directly. The Membro boundary reuses
``repositories.crm.membro_company_filter`` so "which companies can I see" lives
in exactly one place, and additionally lets a Membro see proposals attached to
opportunities they own.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.crm import Company, Opportunity, Proposal
from app.repositories.crm import membro_company_filter


# --------------------------------------------------------------------------- #
# Membro visibility (BR-002)
# --------------------------------------------------------------------------- #
def membro_proposal_filter(user_id: uuid.UUID) -> ColumnElement[bool]:
    """WHERE predicate restricting proposals to those a Membro may see (BR-002):
    ones attached to a company they may see, or to an opportunity they own."""
    return or_(
        Proposal.company_id.in_(
            select(Company.id).where(membro_company_filter(user_id))
        ),
        Proposal.opportunity_id.in_(
            select(Opportunity.id).where(Opportunity.owner_id == user_id)
        ),
    )


def membro_can_see_proposal(
    db: Session, user_id: uuid.UUID, proposal: Proposal
) -> bool:
    return bool(
        db.scalar(
            select(func.count())
            .select_from(Proposal)
            .where(Proposal.id == proposal.id, membro_proposal_filter(user_id))
        )
    )


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #
def get_by_reference(db: Session, reference: str) -> Proposal | None:
    return db.scalar(select(Proposal).where(Proposal.reference == reference))


def _paginate(
    db: Session, stmt: Select, *, page: int, page_size: int
) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars()
    )
    return rows, total


def _sort(sort: str):
    mapping = {
        "reference": Proposal.reference.asc(),
        "-reference": Proposal.reference.desc(),
        "created_at": Proposal.created_at.asc(),
        "-created_at": Proposal.created_at.desc(),
        "valid_until": Proposal.valid_until.asc(),
        "-valid_until": Proposal.valid_until.desc(),
    }
    return mapping.get(sort, Proposal.created_at.desc())


def list_proposals(
    db: Session,
    *,
    scope_filter: ColumnElement[bool] | None,
    opportunity_id: uuid.UUID | None,
    company_id: uuid.UUID | None,
    status: str | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Proposal], int]:
    stmt = select(Proposal)
    conditions: list[ColumnElement[bool]] = []
    if scope_filter is not None:
        conditions.append(scope_filter)
    if not include_archived:
        conditions.append(Proposal.archived_at.is_(None))
    if opportunity_id is not None:
        conditions.append(Proposal.opportunity_id == opportunity_id)
    if company_id is not None:
        conditions.append(Proposal.company_id == company_id)
    if status is not None:
        conditions.append(Proposal.status == status)
    if q:
        conditions.append(Proposal.reference.ilike(f"%{q}%"))
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(_sort(sort))
    return _paginate(db, stmt, page=page, page_size=page_size)


# --------------------------------------------------------------------------- #
# Auto-expiry (AUTO-04 / BR-027)
# --------------------------------------------------------------------------- #
def overdue_open_proposals(db: Session, *, today: date) -> list[Proposal]:
    """Proposals still awaiting a decision (``sent``/``viewed``) whose
    ``valid_until`` is strictly before ``today`` — the AUTO-04 expiry set."""
    return list(
        db.execute(
            select(Proposal).where(
                Proposal.status.in_(("sent", "viewed")),
                Proposal.valid_until.is_not(None),
                Proposal.valid_until < today,
                Proposal.archived_at.is_(None),
            )
        ).scalars()
    )
