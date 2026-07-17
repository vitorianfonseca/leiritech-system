"""Aggregate calendar (F12) — the `/calendar` feed.

Produces the exact ``list[CalendarEvent]`` contract the frontend consumes
(``frontend/src/lib/api/calendar-types.ts``), reproducing the mock's role
scoping (BR-002) and financial gating (BR-008):

* Admin / Gestor            → the whole operation's dated items in range.
* Membro                    → own-scope only (assigned tasks, member/managed
  projects & phases, owned opportunities/proposals, organized/joined meetings).
* Payment (financial) events → surfaced ONLY for a caller who passes the finance
  gate (Admin, or Gestor with the payments grant); a Membro never sees them.

The feed is a read-only projection: every event carries a ``sourceHref`` so the
UI opens the source record. Nothing is created or edited here. Dated deliverables
(tasks / deliveries / proposal expiries / payments) carry an urgency derived from
their date relative to today; meetings, phase-milestones and next-actions do not.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

import structlog
from sqlalchemy.orm import Session

from app.core import permissions
from app.core.permissions import Role
from app.models.user import User
from app.repositories import calendar as repo
from app.schemas.calendar import CalendarEvent, CalendarEventType, CalendarUrgency

logger = structlog.get_logger("aurea.calendar")

_ALL_TYPES: tuple[CalendarEventType, ...] = (
    "task",
    "meeting",
    "milestone",
    "delivery",
    "next_action",
    "proposal_expiry",
    "payment",
)


def _iso_date(d: date) -> str:
    """All-day ISO datetime at UTC midnight for a plain date."""
    return datetime.combine(d, time.min, tzinfo=UTC).isoformat()


def _iso_dt(dt: datetime) -> str:
    return dt.isoformat()


def _urgency(d: date, today: date) -> CalendarUrgency:
    """Urgency for a dated deliverable relative to today (matches the mock)."""
    offset = (d - today).days
    if offset < 0:
        return "overdue"
    if offset <= 1:
        return "due"
    return "upcoming"


def _meeting_href(project_id, opportunity_id, company_id) -> str:
    if project_id is not None:
        return f"/projects/{project_id}"
    if opportunity_id is not None:
        return f"/crm/opportunities/{opportunity_id}"
    if company_id is not None:
        return f"/crm/companies/{company_id}"
    return "/calendar"


def get_calendar(
    db: Session,
    user: User,
    *,
    start: date,
    end: date,
    types: set[CalendarEventType] | None = None,
    project_id: uuid.UUID | None = None,
) -> list[CalendarEvent]:
    """Assemble the role-scoped, finance-gated calendar feed for ``[start, end)``."""
    today = datetime.now(tz=UTC).date()
    wanted = types or set(_ALL_TYPES)
    scope_id = user.id if user.role == Role.MEMBRO else None
    can_finance = permissions.can_manage_financials(user)

    events: list[CalendarEvent] = []

    if "task" in wanted:
        for task, project_name in repo.tasks_due_in_range(
            db, start, end, scope_id, project_id
        ):
            events.append(
                CalendarEvent(
                    id=f"task-{task.id}",
                    type="task",
                    title=task.title,
                    start=_iso_date(task.due_date),
                    all_day=True,
                    project_id=str(task.project_id),
                    project_name=project_name,
                    source_href=f"/tasks?task={task.id}",
                    urgency=_urgency(task.due_date, today),
                )
            )

    if "milestone" in wanted:
        for phase, project_name in repo.phase_deadlines_in_range(
            db, start, end, scope_id, project_id
        ):
            events.append(
                CalendarEvent(
                    id=f"phase-{phase.id}",
                    type="milestone",
                    title=phase.name,
                    start=_iso_date(phase.deadline),
                    all_day=True,
                    project_id=str(phase.project_id),
                    project_name=project_name,
                    source_href=f"/projects/{phase.project_id}",
                )
            )

    if "delivery" in wanted:
        for project in repo.project_deadlines_in_range(
            db, start, end, scope_id, project_id
        ):
            events.append(
                CalendarEvent(
                    id=f"project-{project.id}",
                    type="delivery",
                    title=project.name,
                    start=_iso_date(project.deadline),
                    all_day=True,
                    project_id=str(project.id),
                    project_name=project.name,
                    source_href=f"/projects/{project.id}",
                    urgency=_urgency(project.deadline, today),
                )
            )

    if "proposal_expiry" in wanted:
        for proposal in repo.proposal_expiries_in_range(
            db, start, end, scope_id, project_id
        ):
            events.append(
                CalendarEvent(
                    id=f"proposal-{proposal.id}",
                    type="proposal_expiry",
                    title=proposal.reference,
                    start=_iso_date(proposal.valid_until),
                    all_day=True,
                    source_href=f"/crm/proposals/{proposal.id}",
                    urgency=_urgency(proposal.valid_until, today),
                )
            )

    if "next_action" in wanted:
        for opp in repo.next_actions_in_range(
            db, start, end, scope_id, project_id
        ):
            events.append(
                CalendarEvent(
                    id=f"opportunity-{opp.id}",
                    type="next_action",
                    title=opp.next_action or opp.title,
                    start=_iso_date(opp.next_action_due),
                    all_day=True,
                    source_href=f"/crm/opportunities/{opp.id}",
                    description=opp.title,
                )
            )

    if "meeting" in wanted:
        for meeting, project_name in repo.meetings_in_range(
            db, start, end, scope_id, project_id
        ):
            events.append(
                CalendarEvent(
                    id=f"meeting-{meeting.id}",
                    type="meeting",
                    title=meeting.title,
                    start=_iso_dt(meeting.start_at),
                    end=_iso_dt(meeting.end_at) if meeting.end_at else None,
                    all_day=False,
                    project_id=(
                        str(meeting.project_id)
                        if meeting.project_id is not None
                        else None
                    ),
                    project_name=project_name,
                    source_href=_meeting_href(
                        meeting.project_id,
                        meeting.opportunity_id,
                        meeting.company_id,
                    ),
                )
            )

    # BR-008 — payment (financial) events are gated: never for a caller who
    # cannot manage financials (all Membros, Gestor without the grant).
    if "payment" in wanted and can_finance:
        for pm, project_name in repo.payment_milestones_in_range(
            db, start, end, project_id
        ):
            events.append(
                CalendarEvent(
                    id=f"payment-{pm.id}",
                    type="payment",
                    title=pm.description or project_name or "Pagamento",
                    start=_iso_date(pm.expected_date),
                    all_day=True,
                    project_id=str(pm.project_id),
                    project_name=project_name,
                    source_href=f"/finance?milestone={pm.id}",
                    urgency=_urgency(pm.expected_date, today),
                    amount_cents=pm.amount,
                )
            )

    events.sort(key=lambda e: e.start)
    logger.info(
        "calendar_built",
        actor_id=str(user.id),
        scope="own" if scope_id is not None else "full",
        finance=can_finance,
        count=len(events),
    )
    return events
