"""Proposal-template data-access layer. Children are eager-loaded so the
service can compute totals and serialize without lazy-load surprises.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.proposal_content import ProposalTemplate


def get(db: Session, template_id: uuid.UUID) -> ProposalTemplate | None:
    return db.scalar(
        select(ProposalTemplate)
        .where(ProposalTemplate.id == template_id)
        .options(
            selectinload(ProposalTemplate.sections),
            selectinload(ProposalTemplate.items),
        )
    )


def _paginate(
    db: Session, stmt: Select, *, page: int, page_size: int
) -> tuple[list[ProposalTemplate], int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars()
    )
    return rows, total


def list_templates(
    db: Session,
    *,
    q: str | None,
    include_archived: bool,
    page: int,
    page_size: int,
) -> tuple[list[ProposalTemplate], int]:
    stmt = select(ProposalTemplate).options(
        selectinload(ProposalTemplate.sections),
        selectinload(ProposalTemplate.items),
    )
    if not include_archived:
        stmt = stmt.where(ProposalTemplate.archived_at.is_(None))
    if q:
        stmt = stmt.where(ProposalTemplate.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(ProposalTemplate.name.asc())
    return _paginate(db, stmt, page=page, page_size=page_size)
