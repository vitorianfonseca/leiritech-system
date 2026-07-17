"""Global-search data-access layer (F18).

One trigram-backed read per searchable entity. Every query runs case-insensitive
``ILIKE`` (with user wildcards escaped) against the column that has a
``gin_trgm_ops`` GIN index, and orders by ``similarity()`` so the best matches
come first. The Membro visibility boundary (BR-002) is enforced by reusing each
domain's existing ``membro_*_filter`` predicate — passed in by the service as
``scope_filter`` — so search can never leak a row a caller may not otherwise see.

Services call these; route handlers never touch the ORM directly.
"""

from __future__ import annotations

from sqlalchemy import ColumnElement, Select, and_, func, select
from sqlalchemy.orm import Session

from app.models.crm import Company, Contact, Interaction, Opportunity, Proposal
from app.models.project import Project
from app.models.task import Task


def escape_like(term: str) -> str:
    """Neutralize LIKE/ILIKE wildcards in user input so ``%`` and ``_`` match
    literally and cannot broaden the search (used with ``escape='\\'``)."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _trgm_search(
    db: Session,
    *,
    model: type,
    column: ColumnElement[str],
    term: str,
    scope_filter: ColumnElement[bool] | None,
    extra: list[ColumnElement[bool]],
    limit: int,
) -> list:
    """Run a trigram ILIKE search on ``column`` ordered by similarity.

    ``term`` is the raw (trimmed) user query; wildcards are escaped here and the
    value is always passed as a bound parameter (never string-interpolated into
    SQL), so the query is injection-safe.
    """
    pattern = f"%{escape_like(term)}%"
    conditions: list[ColumnElement[bool]] = [column.ilike(pattern, escape="\\")]
    conditions.extend(extra)
    if scope_filter is not None:
        conditions.append(scope_filter)
    stmt: Select = (
        select(model)
        .where(and_(*conditions))
        .order_by(func.similarity(column, term).desc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars())


def search_companies(
    db: Session, *, term: str, scope_filter: ColumnElement[bool] | None, limit: int
) -> list[Company]:
    return _trgm_search(
        db,
        model=Company,
        column=Company.name,
        term=term,
        scope_filter=scope_filter,
        extra=[Company.archived_at.is_(None)],
        limit=limit,
    )


def search_contacts(
    db: Session, *, term: str, scope_filter: ColumnElement[bool] | None, limit: int
) -> list[Contact]:
    return _trgm_search(
        db,
        model=Contact,
        column=Contact.name,
        term=term,
        scope_filter=scope_filter,
        extra=[Contact.archived_at.is_(None)],
        limit=limit,
    )


def search_opportunities(
    db: Session, *, term: str, scope_filter: ColumnElement[bool] | None, limit: int
) -> list[Opportunity]:
    return _trgm_search(
        db,
        model=Opportunity,
        column=Opportunity.title,
        term=term,
        scope_filter=scope_filter,
        extra=[Opportunity.archived_at.is_(None)],
        limit=limit,
    )


def search_projects(
    db: Session, *, term: str, scope_filter: ColumnElement[bool] | None, limit: int
) -> list[Project]:
    return _trgm_search(
        db,
        model=Project,
        column=Project.name,
        term=term,
        scope_filter=scope_filter,
        extra=[Project.archived_at.is_(None)],
        limit=limit,
    )


def search_tasks(
    db: Session, *, term: str, scope_filter: ColumnElement[bool] | None, limit: int
) -> list[Task]:
    return _trgm_search(
        db,
        model=Task,
        column=Task.title,
        term=term,
        scope_filter=scope_filter,
        extra=[Task.archived_at.is_(None)],
        limit=limit,
    )


def search_proposals(
    db: Session, *, term: str, scope_filter: ColumnElement[bool] | None, limit: int
) -> list[Proposal]:
    return _trgm_search(
        db,
        model=Proposal,
        column=Proposal.reference,
        term=term,
        scope_filter=scope_filter,
        extra=[Proposal.archived_at.is_(None)],
        limit=limit,
    )


def search_interactions(
    db: Session, *, term: str, scope_filter: ColumnElement[bool] | None, limit: int
) -> list[Interaction]:
    # Interactions are not archivable; a NULL body simply never matches ILIKE.
    return _trgm_search(
        db,
        model=Interaction,
        column=Interaction.body,
        term=term,
        scope_filter=scope_filter,
        extra=[],
        limit=limit,
    )
