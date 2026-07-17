"""Aggregate data-access for reports (F19) and the management dashboard (F2).

Read-only rollups over the existing domain tables. Every query lives here so the
report and dashboard services stay pure orchestration (gate → aggregate →
serialize) and the ORM is never touched from a route handler. The Membro
visibility boundary (BR-002) is expressed as an optional ``scope_user_id`` that
restricts projects (manager/member) and tasks (assignee) to the caller's own
work; when ``None`` the rollup is the whole operation (Admin/Gestor).

Archived rows (``archived_at IS NOT NULL``) are excluded everywhere. Money is
integer EUR cents.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.crm import Opportunity, PipelineStage, Proposal
from app.models.finance import PaymentMilestone
from app.models.project import Project, ProjectMember
from app.models.task import Task

_OPEN_MILESTONE_STATUSES = ("planned", "invoiced", "partially_paid", "overdue")
_PROJECT_OPEN_STATUSES = ("planning", "active", "on_hold")
_PROJECT_TERMINAL_FOR_DELIVERY = ("completed", "cancelled", "archived")


# --------------------------------------------------------------------------- #
# Scope helpers (BR-002)
# --------------------------------------------------------------------------- #
def _scoped_project_ids(user_id: uuid.UUID) -> Select:
    """Sub-select of project ids a Membro may see (owns or is a member of)."""
    return select(Project.id).where(
        or_(
            Project.manager_id == user_id,
            Project.id.in_(
                select(ProjectMember.project_id).where(
                    ProjectMember.user_id == user_id
                )
            ),
        )
    )


# --------------------------------------------------------------------------- #
# Commercial
# --------------------------------------------------------------------------- #
def opportunity_outcome_counts(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(Opportunity.outcome, func.count())
        .where(Opportunity.archived_at.is_(None))
        .group_by(Opportunity.outcome)
    ).all()
    counts = {"open": 0, "won": 0, "lost": 0}
    for outcome, count in rows:
        counts[outcome] = count
    return counts


def open_pipeline_value(db: Session) -> tuple[int, int]:
    """(unweighted, probability-weighted) Σ estimated_value of open opps (cents)."""
    unweighted = db.scalar(
        select(func.coalesce(func.sum(Opportunity.estimated_value), 0)).where(
            Opportunity.archived_at.is_(None), Opportunity.outcome == "open"
        )
    )
    weighted = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    Opportunity.estimated_value
                    * func.coalesce(Opportunity.probability, 0)
                    / 100
                ),
                0,
            )
        ).where(Opportunity.archived_at.is_(None), Opportunity.outcome == "open")
    )
    return int(unweighted or 0), int(weighted or 0)


def pipeline_by_stage(db: Session) -> list[tuple[uuid.UUID | None, str, int, int, int]]:
    """(stage_id, name, order_index, open_count, open_value) per stage, ordered."""
    open_opp = and_(
        Opportunity.archived_at.is_(None), Opportunity.outcome == "open"
    )
    rows = db.execute(
        select(
            PipelineStage.id,
            PipelineStage.name,
            PipelineStage.order_index,
            func.count(Opportunity.id),
            func.coalesce(func.sum(Opportunity.estimated_value), 0),
        )
        .outerjoin(
            Opportunity,
            and_(Opportunity.stage_id == PipelineStage.id, open_opp),
        )
        .group_by(PipelineStage.id, PipelineStage.name, PipelineStage.order_index)
        .order_by(PipelineStage.order_index)
    ).all()
    return [(r[0], r[1], r[2], int(r[3]), int(r[4])) for r in rows]


def pipeline_value_by_month(
    db: Session, months: list[tuple[int, int]]
) -> dict[tuple[int, int], int]:
    """Σ open-opp estimated_value keyed by (year, month) of expected_close_date."""
    if not months:
        return {}
    y = func.extract("year", Opportunity.expected_close_date)
    m = func.extract("month", Opportunity.expected_close_date)
    rows = db.execute(
        select(y, m, func.coalesce(func.sum(Opportunity.estimated_value), 0))
        .where(
            Opportunity.archived_at.is_(None),
            Opportunity.outcome == "open",
            Opportunity.expected_close_date.is_not(None),
        )
        .group_by(y, m)
    ).all()
    out = {(int(r[0]), int(r[1])): int(r[2]) for r in rows}
    return {key: out.get(key, 0) for key in months}


def opportunities_no_next_action(
    db: Session, today: date, limit: int = 10
) -> list[Opportunity]:
    """Open opportunities missing a next action or with an overdue one (AUTO-03)."""
    return list(
        db.scalars(
            select(Opportunity)
            .where(
                Opportunity.archived_at.is_(None),
                Opportunity.outcome == "open",
                or_(
                    Opportunity.next_action.is_(None),
                    func.length(func.trim(Opportunity.next_action)) == 0,
                    Opportunity.next_action_due < today,
                ),
            )
            .order_by(Opportunity.updated_at)
            .limit(limit)
        )
    )


def proposals_awaiting(db: Session, limit: int = 10) -> list[Proposal]:
    """Proposals sent/viewed and still awaiting a client decision (AUTO-04)."""
    return list(
        db.scalars(
            select(Proposal)
            .where(
                Proposal.archived_at.is_(None),
                Proposal.status.in_(("sent", "viewed")),
            )
            .order_by(Proposal.valid_until)
            .limit(limit)
        )
    )


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
def _project_scope(stmt: Select, scope_user_id: uuid.UUID | None) -> Select:
    stmt = stmt.where(Project.archived_at.is_(None))
    if scope_user_id is not None:
        stmt = stmt.where(Project.id.in_(_scoped_project_ids(scope_user_id)))
    return stmt


def project_status_counts(
    db: Session, scope_user_id: uuid.UUID | None
) -> dict[str, int]:
    stmt = _project_scope(
        select(Project.status, func.count()), scope_user_id
    ).group_by(Project.status)
    return {status: int(count) for status, count in db.execute(stmt).all()}


def project_health_counts(
    db: Session, scope_user_id: uuid.UUID | None
) -> dict[str | None, int]:
    stmt = _project_scope(
        select(Project.published_health, func.count()), scope_user_id
    ).group_by(Project.published_health)
    return {health: int(count) for health, count in db.execute(stmt).all()}


def completed_on_time(
    db: Session, scope_user_id: uuid.UUID | None
) -> tuple[int, int]:
    """(on_time, late) among completed projects that had a deadline.

    Seam: there is no ``completed_at`` column, so completion instant is
    approximated by ``updated_at``. Flagged for the projects domain owner.
    """
    completed_date = func.date(Project.updated_at)
    base = select(func.count()).where(
        Project.status == "completed", Project.deadline.is_not(None)
    )
    on_time = db.scalar(
        _project_scope(base, scope_user_id).where(completed_date <= Project.deadline)
    )
    late = db.scalar(
        _project_scope(base, scope_user_id).where(completed_date > Project.deadline)
    )
    return int(on_time or 0), int(late or 0)


def projects_by_effective_health(
    db: Session, scope_user_id: uuid.UUID | None
) -> dict[str, list[tuple[uuid.UUID, str]]]:
    """Open projects grouped by effective health (published→suggested→healthy).

    Feeds the dashboard donut + its per-health breakdown list (id + name).
    """
    stmt = _project_scope(
        select(
            Project.id,
            Project.name,
            Project.published_health,
            Project.suggested_health,
        ),
        scope_user_id,
    ).where(Project.status.in_(_PROJECT_OPEN_STATUSES))
    grouped: dict[str, list[tuple[uuid.UUID, str]]] = {
        "healthy": [],
        "attention": [],
        "at_risk": [],
    }
    for pid, name, published, suggested in db.execute(stmt).all():
        health = published or suggested or "healthy"
        grouped.setdefault(health, []).append((pid, name))
    return grouped


def deliveries_within(
    db: Session, start: date, end: date, scope_user_id: uuid.UUID | None
) -> int:
    """Count active projects whose deadline falls in [start, end] (metric)."""
    stmt = _project_scope(select(func.count()), scope_user_id).where(
        Project.deadline.is_not(None),
        Project.deadline >= start,
        Project.deadline <= end,
        Project.status.not_in(_PROJECT_TERMINAL_FOR_DELIVERY),
    )
    return int(db.scalar(stmt) or 0)


def projects_at_risk(
    db: Session, scope_user_id: uuid.UUID | None, limit: int = 10
) -> list[Project]:
    stmt = _project_scope(select(Project), scope_user_id).where(
        Project.published_health == "at_risk",
        Project.status.in_(_PROJECT_OPEN_STATUSES),
    )
    return list(db.scalars(stmt.order_by(Project.deadline).limit(limit)))


def low_progress_near_delivery(
    db: Session, today: date, end: date, scope_user_id: uuid.UUID | None, limit: int = 10
) -> list[Project]:
    """Active projects due soon and not already flagged at_risk (AUTO-06)."""
    stmt = _project_scope(select(Project), scope_user_id).where(
        Project.deadline.is_not(None),
        Project.deadline >= today,
        Project.deadline <= end,
        Project.status.in_(_PROJECT_OPEN_STATUSES),
        or_(
            Project.published_health.is_(None),
            Project.published_health != "at_risk",
        ),
    )
    return list(db.scalars(stmt.order_by(Project.deadline).limit(limit)))


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
def _task_scope(stmt: Select, scope_user_id: uuid.UUID | None) -> Select:
    stmt = stmt.where(Task.archived_at.is_(None))
    if scope_user_id is not None:
        stmt = stmt.where(Task.primary_assignee_id == scope_user_id)
    return stmt


def overdue_task_count(
    db: Session, today: date, scope_user_id: uuid.UUID | None
) -> int:
    stmt = _task_scope(select(func.count()), scope_user_id).where(
        Task.due_date.is_not(None),
        Task.due_date < today,
        Task.status != "done",
    )
    return int(db.scalar(stmt) or 0)


def overdue_tasks(
    db: Session, today: date, scope_user_id: uuid.UUID | None, limit: int = 10
) -> list[tuple[Task, str | None]]:
    stmt = (
        _task_scope(select(Task, Project.name), scope_user_id)
        .join(Project, Project.id == Task.project_id)
        .where(
            Task.due_date.is_not(None),
            Task.due_date < today,
            Task.status != "done",
        )
        .order_by(Task.due_date)
        .limit(limit)
    )
    return [(row[0], row[1]) for row in db.execute(stmt).all()]


def blocked_tasks(
    db: Session, scope_user_id: uuid.UUID | None, limit: int = 10
) -> list[Task]:
    stmt = _task_scope(select(Task), scope_user_id).where(Task.status == "blocked")
    return list(db.scalars(stmt.order_by(Task.updated_at).limit(limit)))


def task_flow_between(
    db: Session, start: date, end: date, scope_user_id: uuid.UUID | None
) -> tuple[int, int]:
    """(done, overdue) for a [start, end) window.

    Seam: no task status-history table, so ``done`` counts tasks currently done
    whose ``updated_at`` lands in the window, and ``overdue`` counts tasks with a
    ``due_date`` in the window that are not done. Approximate throughput.
    """
    done_stmt = _task_scope(select(func.count()), scope_user_id).where(
        Task.status == "done",
        func.date(Task.updated_at) >= start,
        func.date(Task.updated_at) < end,
    )
    overdue_stmt = _task_scope(select(func.count()), scope_user_id).where(
        Task.due_date.is_not(None),
        Task.due_date >= start,
        Task.due_date < end,
        Task.status != "done",
    )
    return int(db.scalar(done_stmt) or 0), int(db.scalar(overdue_stmt) or 0)


# --------------------------------------------------------------------------- #
# Finance (BR-008 gated at the service/route layer)
# --------------------------------------------------------------------------- #
def non_archived_projects(db: Session) -> list[Project]:
    return list(
        db.scalars(
            select(Project)
            .where(Project.archived_at.is_(None))
            .order_by(Project.name)
        )
    )


def pending_total(db: Session) -> int:
    """Σ (amount − received) over open milestones (planned/invoiced/partial/overdue)."""
    value = db.scalar(
        select(
            func.coalesce(
                func.sum(PaymentMilestone.amount - PaymentMilestone.received_amount),
                0,
            )
        ).where(PaymentMilestone.status.in_(_OPEN_MILESTONE_STATUSES))
    )
    return int(value or 0)


def overdue_total(db: Session) -> int:
    value = db.scalar(
        select(
            func.coalesce(
                func.sum(PaymentMilestone.amount - PaymentMilestone.received_amount),
                0,
            )
        ).where(PaymentMilestone.status == "overdue")
    )
    return int(value or 0)


def overdue_milestones(
    db: Session, limit: int = 10
) -> list[tuple[PaymentMilestone, str | None, date | None]]:
    """(milestone, project_name, expected_date) for overdue payment milestones."""
    stmt = (
        select(PaymentMilestone, Project.name)
        .join(Project, Project.id == PaymentMilestone.project_id)
        .where(PaymentMilestone.status == "overdue")
        .order_by(PaymentMilestone.expected_date)
        .limit(limit)
    )
    return [(row[0], row[1], row[0].expected_date) for row in db.execute(stmt).all()]


def contracted_by_month(
    db: Session, months: list[tuple[int, int]]
) -> dict[tuple[int, int], int]:
    """Σ milestone amount keyed by (year, month) of expected_date (non-cancelled)."""
    if not months:
        return {}
    y = func.extract("year", PaymentMilestone.expected_date)
    m = func.extract("month", PaymentMilestone.expected_date)
    rows = db.execute(
        select(y, m, func.coalesce(func.sum(PaymentMilestone.amount), 0))
        .where(
            PaymentMilestone.expected_date.is_not(None),
            PaymentMilestone.status != "cancelled",
        )
        .group_by(y, m)
    ).all()
    out = {(int(r[0]), int(r[1])): int(r[2]) for r in rows}
    return {key: out.get(key, 0) for key in months}


def received_by_month(
    db: Session, months: list[tuple[int, int]]
) -> dict[tuple[int, int], int]:
    """Σ received_amount keyed by (year, month) of paid_date."""
    if not months:
        return {}
    y = func.extract("year", PaymentMilestone.paid_date)
    m = func.extract("month", PaymentMilestone.paid_date)
    rows = db.execute(
        select(y, m, func.coalesce(func.sum(PaymentMilestone.received_amount), 0))
        .where(PaymentMilestone.paid_date.is_not(None))
        .group_by(y, m)
    ).all()
    out = {(int(r[0]), int(r[1])): int(r[2]) for r in rows}
    return {key: out.get(key, 0) for key in months}
