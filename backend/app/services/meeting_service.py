"""Meeting business logic (WORKFLOW_SPEC §1.9, audit C11).

Previously the Meeting entity had a DB model but zero CRUD API — "log a
meeting" faked it as a plain Interaction row with no state/organizer/reminder,
so AUTO-10 (meeting reminder) could never fire and My Work / Calendar meeting
lanes were permanently empty. This gives it a real lifecycle mirroring the
other entity services in this codebase (scoped reads for a Membro per BR-002,
an append-only audit trail per BR-064). On ``held``, an Interaction row is
also written so the CRM timeline stays the single source of truth for
"what happened", per §1.9's own note.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import Role, role_at_least
from app.models.crm import Company, Interaction, Meeting, Opportunity
from app.models.project import Project
from app.models.user import User
from app.repositories import crm as crm_repo
from app.repositories import pipeline as pipeline_repo
from app.schemas.meetings import MeetingCreate, MeetingHeld, MeetingReschedule
from app.services import activity_service

logger = structlog.get_logger("leiritech.crm.meeting")

ENTITY_TYPE = "meeting"

_TERMINAL = ("held",)


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


def _validate_links(db: Session, user: User, payload: MeetingCreate) -> None:
    """Referenced entities must exist AND be visible to the caller.

    Same enumeration-safety rule as interaction_service (issue #49, BR-002): an
    out-of-scope id is reported as 404, exactly like a non-existent one, so the
    response cannot be used to probe which projects/companies exist.
    """
    membro = _is_membro(user)

    if payload.company_id:
        company = db.get(Company, payload.company_id)
        if company is None or (
            membro and not crm_repo.membro_can_see_company(db, user.id, company)
        ):
            raise errors.not_found("Empresa não encontrada.", code="COMPANY_NOT_FOUND")
    if payload.opportunity_id:
        opp = db.get(Opportunity, payload.opportunity_id)
        if opp is None or (
            membro and not pipeline_repo.membro_can_see_opportunity(db, user.id, opp)
        ):
            raise errors.not_found(
                "Oportunidade não encontrada.", code="OPPORTUNITY_NOT_FOUND"
            )
    if payload.project_id:
        project = db.get(Project, payload.project_id)
        if project is None or (
            membro
            and project.manager_id != user.id
            and not crm_repo.membro_is_project_member(db, user.id, project.id)
        ):
            raise errors.not_found("Projeto não encontrado.", code="PROJECT_NOT_FOUND")


def _assert_membro_may_log(db: Session, user: User, payload: MeetingCreate) -> None:
    if payload.project_id and crm_repo.membro_is_project_member(
        db, user.id, payload.project_id
    ):
        return
    if payload.company_id:
        company = db.get(Company, payload.company_id)
        if company and crm_repo.membro_can_see_company(db, user.id, company):
            return
    if payload.opportunity_id:
        opp = db.get(Opportunity, payload.opportunity_id)
        if opp and pipeline_repo.membro_can_see_opportunity(db, user.id, opp):
            return
    raise errors.forbidden(
        "Só pode agendar reuniões nos seus próprios projetos/clientes.",
        code="MEETING_FORBIDDEN",
    )


def _membro_scope_filter(user_id: uuid.UUID):
    """A Membro sees a meeting when they organized it, or it's linked to a
    project they belong to (mirrors the interaction scope filter)."""
    from app.models.project import ProjectMember

    member_projects = select(ProjectMember.project_id).where(
        ProjectMember.user_id == user_id
    )
    return (Meeting.organizer_id == user_id) | (Meeting.project_id.in_(member_projects))


def get_meeting_or_404(db: Session, user: User, meeting_id: uuid.UUID) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise errors.not_found("Reunião não encontrada.", code="MEETING_NOT_FOUND")
    if _is_membro(user):
        allowed = db.execute(
            select(Meeting.id).where(
                Meeting.id == meeting_id, _membro_scope_filter(user.id)
            )
        ).scalar_one_or_none()
        if allowed is None:
            raise errors.not_found("Reunião não encontrada.", code="MEETING_NOT_FOUND")
    return meeting


def list_meetings(
    db: Session,
    user: User,
    *,
    company_id: uuid.UUID | None,
    opportunity_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    upcoming_only: bool,
) -> list[Meeting]:
    stmt = select(Meeting)
    if company_id:
        stmt = stmt.where(Meeting.company_id == company_id)
    if opportunity_id:
        stmt = stmt.where(Meeting.opportunity_id == opportunity_id)
    if project_id:
        stmt = stmt.where(Meeting.project_id == project_id)
    if upcoming_only:
        stmt = stmt.where(Meeting.status == "scheduled")
    if _is_membro(user):
        stmt = stmt.where(_membro_scope_filter(user.id))
    stmt = stmt.order_by(Meeting.start_at)
    return list(db.execute(stmt).scalars())


def create_meeting(db: Session, user: User, payload: MeetingCreate) -> Meeting:
    _validate_links(db, user, payload)
    if _is_membro(user):
        _assert_membro_may_log(db, user, payload)

    meeting = Meeting(
        title=payload.title,
        start_at=payload.start_at,
        end_at=payload.end_at,
        organizer_id=user.id,
        company_id=payload.company_id,
        opportunity_id=payload.opportunity_id,
        project_id=payload.project_id,
        status="scheduled",
        created_by=user.id,
    )
    db.add(meeting)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=meeting.id,
        action="meeting.scheduled",
        actor_id=user.id,
        after={"title": meeting.title, "start_at": meeting.start_at.isoformat()},
    )
    logger.info("meeting_scheduled", meeting_id=str(meeting.id), actor_id=str(user.id))
    return meeting


def _assert_not_terminal(meeting: Meeting) -> None:
    if meeting.status in _TERMINAL:
        raise errors.conflict(
            "Reunião já realizada não pode ser alterada.", code="MEETING_HELD"
        )


def mark_held(
    db: Session, user: User, meeting_id: uuid.UUID, payload: MeetingHeld
) -> Meeting:
    meeting = get_meeting_or_404(db, user, meeting_id)
    _assert_not_terminal(meeting)
    before_status = meeting.status
    meeting.status = "held"
    meeting.outcome_note = payload.outcome_note
    # §1.9: a held meeting feeds the CRM interaction timeline.
    interaction = Interaction(
        type="meeting",
        company_id=meeting.company_id,
        opportunity_id=meeting.opportunity_id,
        project_id=meeting.project_id,
        body=payload.outcome_note or f"Reunião: {meeting.title}",
        occurred_at=datetime.now(tz=UTC),
        user_id=user.id,
        created_by=user.id,
    )
    db.add(interaction)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=meeting.id,
        action="meeting.held",
        actor_id=user.id,
        before={"status": before_status},
        after={"status": "held"},
    )
    logger.info("meeting_held", meeting_id=str(meeting.id), actor_id=str(user.id))
    return meeting


def cancel_meeting(db: Session, user: User, meeting_id: uuid.UUID) -> Meeting:
    meeting = get_meeting_or_404(db, user, meeting_id)
    _assert_not_terminal(meeting)
    before_status = meeting.status
    meeting.status = "cancelled"
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=meeting.id,
        action="meeting.cancelled",
        actor_id=user.id,
        before={"status": before_status},
        after={"status": "cancelled"},
    )
    logger.info("meeting_cancelled", meeting_id=str(meeting.id), actor_id=str(user.id))
    return meeting


def mark_no_show(db: Session, user: User, meeting_id: uuid.UUID) -> Meeting:
    meeting = get_meeting_or_404(db, user, meeting_id)
    _assert_not_terminal(meeting)
    if meeting.start_at > datetime.now(tz=UTC):
        raise errors.conflict(
            "A reunião ainda não ocorreu.", code="MEETING_NOT_YET_STARTED"
        )
    before_status = meeting.status
    meeting.status = "no_show"
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=meeting.id,
        action="meeting.no_show",
        actor_id=user.id,
        before={"status": before_status},
        after={"status": "no_show"},
    )
    logger.info("meeting_no_show", meeting_id=str(meeting.id), actor_id=str(user.id))
    return meeting


def reschedule_meeting(
    db: Session, user: User, meeting_id: uuid.UUID, payload: MeetingReschedule
) -> Meeting:
    """§1.9: cancelled/no_show → scheduled with a new (future) start_at."""
    meeting = get_meeting_or_404(db, user, meeting_id)
    if meeting.status not in ("cancelled", "no_show"):
        raise errors.conflict(
            "Só é possível reagendar uma reunião cancelada ou sem comparência.",
            code="MEETING_NOT_RESCHEDULABLE",
        )
    if payload.start_at <= datetime.now(tz=UTC):
        raise errors.ApiError(
            status_code=422,
            code="MEETING_START_MUST_BE_FUTURE",
            message="A nova data tem de ser futura.",
        )
    before_status = meeting.status
    meeting.status = "scheduled"
    meeting.start_at = payload.start_at
    meeting.end_at = payload.end_at
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=meeting.id,
        action="meeting.rescheduled",
        actor_id=user.id,
        before={"status": before_status},
        after={"status": "scheduled", "start_at": meeting.start_at.isoformat()},
    )
    logger.info("meeting_rescheduled", meeting_id=str(meeting.id), actor_id=str(user.id))
    return meeting
