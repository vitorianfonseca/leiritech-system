"""Financial data-access layer (F14, BR-065..073).

SQLAlchemy 2.0 (sync ``Session``) query building for payment milestones,
project costs, and the aggregate reads the live-margin computation needs.
Services call these; route handlers never touch the ORM directly.

There is no Membro visibility filter here on purpose: the whole financial
surface is gated to Admin / Gestor-with-grant at the dependency layer (BR-008),
so a Membro never reaches these queries at all.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import ColumnElement, Select, and_, func, select
from sqlalchemy.orm import Session

from app.models.finance import PaymentMilestone, ProjectCost
from app.models.task import Task
from app.models.time_entry import TimeEntry


# --------------------------------------------------------------------------- #
# Payment milestones
# --------------------------------------------------------------------------- #
def get_milestone(db: Session, milestone_id: uuid.UUID) -> PaymentMilestone | None:
    return db.get(PaymentMilestone, milestone_id)


def _paginate(
    db: Session, stmt: Select, *, page: int, page_size: int
) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars()
    )
    return rows, total


def list_milestones(
    db: Session,
    *,
    project_id: uuid.UUID | None,
    company_id: uuid.UUID | None,
    status: str | None,
    page: int,
    page_size: int,
) -> tuple[list[PaymentMilestone], int]:
    stmt = select(PaymentMilestone)
    conditions: list[ColumnElement[bool]] = []
    if project_id is not None:
        conditions.append(PaymentMilestone.project_id == project_id)
    if company_id is not None:
        conditions.append(PaymentMilestone.company_id == company_id)
    if status is not None:
        conditions.append(PaymentMilestone.status == status)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(
        PaymentMilestone.expected_date.asc().nulls_last(),
        PaymentMilestone.created_at.asc(),
    )
    return _paginate(db, stmt, page=page, page_size=page_size)


# --------------------------------------------------------------------------- #
# Project costs
# --------------------------------------------------------------------------- #
def get_cost(db: Session, cost_id: uuid.UUID) -> ProjectCost | None:
    return db.get(ProjectCost, cost_id)


def list_costs(
    db: Session, *, project_id: uuid.UUID | None, page: int, page_size: int
) -> tuple[list[ProjectCost], int]:
    stmt = select(ProjectCost)
    if project_id is not None:
        stmt = stmt.where(ProjectCost.project_id == project_id)
    stmt = stmt.order_by(
        ProjectCost.date.desc().nulls_last(), ProjectCost.created_at.desc()
    )
    return _paginate(db, stmt, page=page, page_size=page_size)


# --------------------------------------------------------------------------- #
# Aggregates for the live-margin computation (BR-065)
# --------------------------------------------------------------------------- #
def costs_total(db: Session, project_id: uuid.UUID) -> int:
    """Σ project_costs.amount (cents) for a project. 0 over the empty set."""
    return int(
        db.scalar(
            select(func.coalesce(func.sum(ProjectCost.amount), 0)).where(
                ProjectCost.project_id == project_id
            )
        )
        or 0
    )


def milestone_totals(db: Session, project_id: uuid.UUID) -> tuple[int, int, int]:
    """Return (active_amount, received, milestone_count) for a project.

    ``active_amount`` and ``received`` exclude ``cancelled`` milestones so a
    written-off milestone does not distort received/pending (H3).
    """
    row = db.execute(
        select(
            func.coalesce(
                func.sum(PaymentMilestone.amount).filter(
                    PaymentMilestone.status != "cancelled"
                ),
                0,
            ),
            func.coalesce(
                func.sum(PaymentMilestone.received_amount).filter(
                    PaymentMilestone.status != "cancelled"
                ),
                0,
            ),
            func.count(),
        ).where(PaymentMilestone.project_id == project_id)
    ).one()
    return int(row[0] or 0), int(row[1] or 0), int(row[2] or 0)


def logged_seconds(db: Session, project_id: uuid.UUID) -> float:
    """Σ elapsed seconds of COMPLETED time entries on this project's tasks.

    Only closed entries (``ended_at IS NOT NULL``) count toward labour cost;
    a running timer has no settled duration yet. Both billable and internal
    hours count (BR-065 — labour cost is agnostic to billability).
    """
    seconds = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    func.extract(
                        "epoch", TimeEntry.ended_at - TimeEntry.started_at
                    )
                ),
                0,
            )
        )
        .select_from(TimeEntry)
        .join(Task, Task.id == TimeEntry.task_id)
        .where(Task.project_id == project_id, TimeEntry.ended_at.is_not(None))
    )
    return float(seconds or 0.0)


# --------------------------------------------------------------------------- #
# Automation reads (AUTO-02 overdue / AUTO-08 due-soon)
# --------------------------------------------------------------------------- #
# A milestone is still "open" (money outstanding) while planned/invoiced/
# partially_paid; paid and cancelled are settled/void and never flagged.
_OPEN_MILESTONE_STATUSES = ("planned", "invoiced", "partially_paid")


def overdue_open_milestones(db: Session, *, today: date) -> list[PaymentMilestone]:
    """Open milestones whose ``expected_date`` is strictly before ``today`` — the
    AUTO-02 set. Runs regardless of project state (external reconciliation may
    outlive delivery, BR-054)."""
    return list(
        db.execute(
            select(PaymentMilestone).where(
                PaymentMilestone.status.in_(_OPEN_MILESTONE_STATUSES),
                PaymentMilestone.expected_date.is_not(None),
                PaymentMilestone.expected_date < today,
            )
        ).scalars()
    )


def due_soon_milestones(
    db: Session, *, today: date, within_days: int, live_statuses: tuple[str, ...]
) -> list[PaymentMilestone]:
    """Open milestones due within ``within_days`` (inclusive) on a LIVE project —
    the AUTO-08 set (BR-067, live project only per BR-054)."""
    from app.models.project import Project

    horizon = today + timedelta(days=within_days)
    return list(
        db.execute(
            select(PaymentMilestone)
            .join(Project, PaymentMilestone.project_id == Project.id)
            .where(
                PaymentMilestone.status.in_(_OPEN_MILESTONE_STATUSES),
                PaymentMilestone.expected_date.is_not(None),
                PaymentMilestone.expected_date >= today,
                PaymentMilestone.expected_date <= horizon,
                Project.status.in_(live_statuses),
            )
        ).scalars()
    )
