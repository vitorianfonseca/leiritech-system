"""Aggregate data-access for the calendar feed (F12).

Read-only range queries over the existing domain tables (tasks, project phases,
projects, proposals, opportunities, meetings, and — finance-gated at the service
layer — payment milestones). Every query lives here so ``calendar_service`` stays
pure orchestration (scope → aggregate → serialize) and the ORM is never touched
from a route handler.

Dates are half-open ``[start, end)`` in ``date`` form. The Membro visibility
boundary (BR-002) is expressed as an optional ``scope_user_id`` that restricts
each source to the caller's own work (assigned tasks, member/managed projects,
owned opportunities/proposals, organized/joined meetings). An optional
``project_id`` restricts the whole feed to a single project (embed — #32).
Archived rows are excluded. Money is integer EUR cents.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models.crm import Meeting, Opportunity, Proposal
from app.models.finance import PaymentMilestone
from app.models.project import Project, ProjectMember, ProjectPhase
from app.models.task import Task

_PROJECT_TERMINAL = ("completed", "cancelled", "archived")
_PROPOSAL_OPEN = ("draft", "sent", "viewed")


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
# Tasks — due dates
# --------------------------------------------------------------------------- #
def tasks_due_in_range(
    db: Session,
    start: date,
    end: date,
    scope_user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> list[tuple[Task, str | None]]:
    stmt = (
        select(Task, Project.name)
        .join(Project, Project.id == Task.project_id)
        .where(
            Task.archived_at.is_(None),
            Task.due_date.is_not(None),
            Task.due_date >= start,
            Task.due_date < end,
            Task.status != "done",
        )
    )
    if scope_user_id is not None:
        stmt = stmt.where(Task.primary_assignee_id == scope_user_id)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    return [(row[0], row[1]) for row in db.execute(stmt).all()]


# --------------------------------------------------------------------------- #
# Project phases — deadlines (surfaced as "milestone" events)
# --------------------------------------------------------------------------- #
def phase_deadlines_in_range(
    db: Session,
    start: date,
    end: date,
    scope_user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> list[tuple[ProjectPhase, str | None]]:
    stmt = (
        select(ProjectPhase, Project.name)
        .join(Project, Project.id == ProjectPhase.project_id)
        .where(
            Project.archived_at.is_(None),
            ProjectPhase.deadline.is_not(None),
            ProjectPhase.deadline >= start,
            ProjectPhase.deadline < end,
        )
    )
    if scope_user_id is not None:
        stmt = stmt.where(Project.id.in_(_scoped_project_ids(scope_user_id)))
    if project_id is not None:
        stmt = stmt.where(ProjectPhase.project_id == project_id)
    return [(row[0], row[1]) for row in db.execute(stmt).all()]


# --------------------------------------------------------------------------- #
# Projects — deadlines (surfaced as "delivery" events)
# --------------------------------------------------------------------------- #
def project_deadlines_in_range(
    db: Session,
    start: date,
    end: date,
    scope_user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> list[Project]:
    stmt = select(Project).where(
        Project.archived_at.is_(None),
        Project.deadline.is_not(None),
        Project.deadline >= start,
        Project.deadline < end,
        Project.status.not_in(_PROJECT_TERMINAL),
    )
    if scope_user_id is not None:
        stmt = stmt.where(Project.id.in_(_scoped_project_ids(scope_user_id)))
    if project_id is not None:
        stmt = stmt.where(Project.id == project_id)
    return list(db.scalars(stmt))


# --------------------------------------------------------------------------- #
# Proposals — validity expiring
# --------------------------------------------------------------------------- #
def proposal_expiries_in_range(
    db: Session,
    start: date,
    end: date,
    scope_user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> list[Proposal]:
    # Proposals carry no project link → the project-scoped embed excludes them.
    if project_id is not None:
        return []
    stmt = select(Proposal).where(
        Proposal.archived_at.is_(None),
        Proposal.valid_until.is_not(None),
        Proposal.valid_until >= start,
        Proposal.valid_until < end,
        Proposal.status.in_(_PROPOSAL_OPEN),
    )
    if scope_user_id is not None:
        # A Membro only sees proposals tied to an opportunity they own.
        owned = select(Opportunity.id).where(
            Opportunity.owner_id == scope_user_id
        )
        stmt = stmt.where(Proposal.opportunity_id.in_(owned))
    return list(db.scalars(stmt))


# --------------------------------------------------------------------------- #
# Opportunities — commercial next actions
# --------------------------------------------------------------------------- #
def next_actions_in_range(
    db: Session,
    start: date,
    end: date,
    scope_user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> list[Opportunity]:
    # Opportunities carry no project link → excluded from the project embed.
    if project_id is not None:
        return []
    stmt = select(Opportunity).where(
        Opportunity.archived_at.is_(None),
        Opportunity.outcome == "open",
        Opportunity.next_action.is_not(None),
        func.length(func.trim(Opportunity.next_action)) > 0,
        Opportunity.next_action_due.is_not(None),
        Opportunity.next_action_due >= start,
        Opportunity.next_action_due < end,
    )
    if scope_user_id is not None:
        stmt = stmt.where(Opportunity.owner_id == scope_user_id)
    return list(db.scalars(stmt))


# --------------------------------------------------------------------------- #
# Meetings
# --------------------------------------------------------------------------- #
def meetings_in_range(
    db: Session,
    start: date,
    end: date,
    scope_user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> list[tuple[Meeting, str | None]]:
    day = func.date(Meeting.start_at)
    stmt = (
        select(Meeting, Project.name)
        .outerjoin(Project, Project.id == Meeting.project_id)
        .where(
            Meeting.status != "cancelled",
            day >= start,
            day < end,
        )
    )
    if scope_user_id is not None:
        stmt = stmt.where(
            or_(
                Meeting.organizer_id == scope_user_id,
                Meeting.project_id.in_(_scoped_project_ids(scope_user_id)),
            )
        )
    if project_id is not None:
        stmt = stmt.where(Meeting.project_id == project_id)
    return [(row[0], row[1]) for row in db.execute(stmt).all()]


# --------------------------------------------------------------------------- #
# Payment milestones (finance-gated at the service layer — BR-008)
# --------------------------------------------------------------------------- #
def payment_milestones_in_range(
    db: Session,
    start: date,
    end: date,
    project_id: uuid.UUID | None,
) -> list[tuple[PaymentMilestone, str | None]]:
    stmt = (
        select(PaymentMilestone, Project.name)
        .join(Project, Project.id == PaymentMilestone.project_id)
        .where(
            PaymentMilestone.expected_date.is_not(None),
            PaymentMilestone.expected_date >= start,
            PaymentMilestone.expected_date < end,
            PaymentMilestone.status != "cancelled",
        )
    )
    if project_id is not None:
        stmt = stmt.where(PaymentMilestone.project_id == project_id)
    return [(row[0], row[1]) for row in db.execute(stmt).all()]
