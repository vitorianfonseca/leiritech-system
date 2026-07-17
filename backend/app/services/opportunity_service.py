"""Opportunity / pipeline business logic (F5 commercial pipeline, F7 won→project).

All opportunity mutations flow through here so the pipeline state machine
(BR-013 won cannot revert), the próxima-ação requirement (BR-010), the
lost-reason requirement (BR-011), the Membro visibility boundary (BR-002), the
soft-delete rules (BR-060) and the audit trail (BR-064) are enforced in exactly
one place. Route handlers stay thin: authenticate, delegate, serialize.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import Role, role_at_least
from app.models.crm import Company, Opportunity, PipelineStage
from app.models.user import User
from app.repositories import pipeline as pipeline_repo
from app.schemas.pipeline import (
    ConversionContact,
    ConversionPrefill,
    OpportunityCreate,
    OpportunityLose,
    OpportunityMove,
    OpportunityUpdate,
    OpportunityWin,
    PipelineStageCreate,
    PipelineStageUpdate,
)
from app.services import activity_service

logger = structlog.get_logger("aurea.pipeline.opportunity")

ENTITY_TYPE = "opportunity"

# Terminal outcomes cannot regress; only ``open`` deals move/win/lose (BR-013).
_TERMINAL_OUTCOMES = ("won", "lost")

_SNAPSHOT_FIELDS = (
    "title",
    "company_id",
    "primary_contact_id",
    "owner_id",
    "stage_id",
    "estimated_value",
    "probability",
    "expected_close_date",
    "source",
    "description",
    "next_action",
    "next_action_due",
    "outcome",
    "lost_reason",
)


def _snapshot(opp: Opportunity) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in _SNAPSHOT_FIELDS:
        value = getattr(opp, field)
        if isinstance(value, uuid.UUID | date | datetime):
            value = str(value)
        out[field] = value
    return out


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


# --------------------------------------------------------------------------- #
# Pipeline stages (BR-012 / BR-020)
# --------------------------------------------------------------------------- #
def list_stages(db: Session) -> list[PipelineStage]:
    return pipeline_repo.list_stages(db)


def create_stage(db: Session, user: User, payload: PipelineStageCreate) -> PipelineStage:
    if pipeline_repo.get_stage_by_code(db, payload.code) is not None:
        raise errors.conflict(
            "Já existe uma fase com este código.", code="STAGE_CODE_EXISTS"
        )
    stage = PipelineStage(
        name=payload.name,
        code=payload.code,
        color=payload.color,
        order_index=payload.order_index,
        win_probability=payload.win_probability,
        created_by=user.id,
    )
    db.add(stage)
    db.flush()
    logger.info("stage_created", stage_id=str(stage.id), actor_id=str(user.id))
    return stage


def update_stage(
    db: Session, user: User, stage_id: uuid.UUID, payload: PipelineStageUpdate
) -> PipelineStage:
    stage = db.get(PipelineStage, stage_id)
    if stage is None:
        raise errors.not_found("Fase não encontrada.", code="STAGE_NOT_FOUND")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(stage, field, value)
    db.flush()
    logger.info("stage_updated", stage_id=str(stage.id), actor_id=str(user.id))
    return stage


# --------------------------------------------------------------------------- #
# Opportunity reads
# --------------------------------------------------------------------------- #
def get_opportunity_or_404(
    db: Session, user: User, opportunity_id: uuid.UUID
) -> Opportunity:
    """Load an opportunity, enforcing the Membro visibility boundary.

    A Membro requesting an opportunity outside their scope gets 404 (not 403) so
    they cannot enumerate records they are not attached to (BR-002).
    """
    opp = db.get(Opportunity, opportunity_id)
    if opp is None:
        raise errors.not_found(
            "Oportunidade não encontrada.", code="OPPORTUNITY_NOT_FOUND"
        )
    if _is_membro(user) and not pipeline_repo.membro_can_see_opportunity(
        db, user.id, opp
    ):
        raise errors.not_found(
            "Oportunidade não encontrada.", code="OPPORTUNITY_NOT_FOUND"
        )
    return opp


def list_opportunities(
    db: Session,
    user: User,
    *,
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
    scope_filter = (
        pipeline_repo.membro_opportunity_filter(user.id) if _is_membro(user) else None
    )
    return pipeline_repo.list_opportunities(
        db,
        scope_filter=scope_filter,
        stage_id=stage_id,
        company_id=company_id,
        owner_id=owner_id,
        outcome=outcome,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )


# --------------------------------------------------------------------------- #
# Validation helpers
# --------------------------------------------------------------------------- #
def _validate_stage(db: Session, stage_id: uuid.UUID | None) -> None:
    if stage_id is not None and db.get(PipelineStage, stage_id) is None:
        raise errors.bad_request("Fase inválida.", code="STAGE_NOT_FOUND")


def _validate_company(db: Session, company_id: uuid.UUID | None) -> None:
    if company_id is not None and db.get(Company, company_id) is None:
        raise errors.bad_request("Empresa inválida.", code="COMPANY_NOT_FOUND")


def _assert_open(opp: Opportunity) -> None:
    """BR-013: won/lost deals are terminal and cannot be moved or re-closed."""
    if opp.outcome in _TERMINAL_OUTCOMES:
        raise errors.conflict(
            "Esta oportunidade já está fechada e não pode ser alterada.",
            code="OPPORTUNITY_ALREADY_CLOSED",
        )


def _assert_next_action(opp: Opportunity) -> None:
    """BR-010: an open opportunity must always carry a próxima ação."""
    if not (opp.next_action and opp.next_action.strip()):
        raise errors.ApiError(
            status_code=422,
            code="NEXT_ACTION_REQUIRED",
            message="Uma oportunidade aberta precisa de uma próxima ação (BR-010).",
        )


# --------------------------------------------------------------------------- #
# Opportunity writes
# --------------------------------------------------------------------------- #
def create_opportunity(
    db: Session, user: User, payload: OpportunityCreate
) -> Opportunity:
    _validate_stage(db, payload.stage_id)
    _validate_company(db, payload.company_id)
    opp = Opportunity(
        title=payload.title,
        company_id=payload.company_id,
        primary_contact_id=payload.primary_contact_id,
        owner_id=payload.owner_id,
        stage_id=payload.stage_id,
        estimated_value=payload.estimated_value,
        probability=payload.probability,
        expected_close_date=payload.expected_close_date,
        source=payload.source,
        description=payload.description,
        next_action=payload.next_action,
        next_action_due=payload.next_action_due,
        outcome="open",
        created_by=user.id,
    )
    _assert_next_action(opp)  # BR-010 (defensive; schema already requires it)
    db.add(opp)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=opp.id,
        action="opportunity.created",
        actor_id=user.id,
        after=_snapshot(opp),
    )
    logger.info(
        "opportunity_created", opportunity_id=str(opp.id), actor_id=str(user.id)
    )
    return opp


def update_opportunity(
    db: Session, user: User, opportunity_id: uuid.UUID, payload: OpportunityUpdate
) -> Opportunity:
    opp = get_opportunity_or_404(db, user, opportunity_id)
    _assert_open(opp)  # attributes of closed deals are frozen (BR-013/BR-036)
    before = _snapshot(opp)
    changes = payload.model_dump(exclude_unset=True)
    if "stage_id" in changes:
        _validate_stage(db, changes["stage_id"])
    if "company_id" in changes:
        _validate_company(db, changes["company_id"])
    for field, value in changes.items():
        setattr(opp, field, value)
    _assert_next_action(opp)  # BR-010 — cannot blank out the próxima ação
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=opp.id,
        action="opportunity.updated",
        actor_id=user.id,
        before=before,
        after=_snapshot(opp),
    )
    logger.info(
        "opportunity_updated",
        opportunity_id=str(opp.id),
        actor_id=str(user.id),
        fields=sorted(changes.keys()),
    )
    return opp


def move_opportunity(
    db: Session, user: User, opportunity_id: uuid.UUID, payload: OpportunityMove
) -> Opportunity:
    """Move a deal to another stage (F5). Deals may regress between any active
    stages; only open deals move (BR-013). A próxima ação is required (BR-010)."""
    opp = get_opportunity_or_404(db, user, opportunity_id)
    _assert_open(opp)
    _validate_stage(db, payload.stage_id)
    before = _snapshot(opp)
    opp.stage_id = payload.stage_id
    if payload.next_action is not None:
        opp.next_action = payload.next_action
    if payload.next_action_due is not None:
        opp.next_action_due = payload.next_action_due
    _assert_next_action(opp)  # BR-010 — must have one after the move
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=opp.id,
        action="opportunity.moved",
        actor_id=user.id,
        before=before,
        after=_snapshot(opp),
    )
    logger.info(
        "opportunity_moved",
        opportunity_id=str(opp.id),
        stage_id=str(payload.stage_id),
        actor_id=str(user.id),
    )
    return opp


def win_opportunity(
    db: Session, user: User, opportunity_id: uuid.UUID, payload: OpportunityWin
) -> Opportunity:
    """Mark a deal won (BR-013 — committed, cannot revert). A verbal close (no
    accepted proposal) is allowed; the soft warning is a frontend concern."""
    opp = get_opportunity_or_404(db, user, opportunity_id)
    _assert_open(opp)
    before = _snapshot(opp)
    opp.outcome = "won"
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=opp.id,
        action="opportunity.won",
        actor_id=user.id,
        before=before,
        after={**_snapshot(opp), "note": payload.note},
    )
    logger.info(
        "opportunity_won", opportunity_id=str(opp.id), actor_id=str(user.id)
    )
    return opp


def lose_opportunity(
    db: Session, user: User, opportunity_id: uuid.UUID, payload: OpportunityLose
) -> Opportunity:
    """Mark a deal lost. BR-011: a lost reason is mandatory (schema-enforced)."""
    opp = get_opportunity_or_404(db, user, opportunity_id)
    _assert_open(opp)
    before = _snapshot(opp)
    opp.outcome = "lost"
    opp.lost_reason = payload.lost_reason
    opp.lost_at = datetime.now(tz=UTC)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=opp.id,
        action="opportunity.lost",
        actor_id=user.id,
        before=before,
        after=_snapshot(opp),
    )
    logger.info(
        "opportunity_lost", opportunity_id=str(opp.id), actor_id=str(user.id)
    )
    return opp


def convert_opportunity(
    db: Session, user: User, opportunity_id: uuid.UUID
) -> ConversionPrefill:
    """Build the won→project handoff prefill (F7 / BR-035..038).

    Read-only: it does NOT create the project (that is the projects domain). It
    returns the data the project spin-up wizard needs to instantiate a project
    with zero re-entry — company, contacts, and a contracted value pre-filled
    from the accepted proposal, or ``None`` for a verbal close (BR-035/C1). Only
    a won opportunity can be converted (BR-035).
    """
    opp = get_opportunity_or_404(db, user, opportunity_id)
    if opp.outcome != "won":
        raise errors.conflict(
            "Só é possível converter oportunidades ganhas.",
            code="OPPORTUNITY_NOT_WON",
        )

    company: Company | None = (
        db.get(Company, opp.company_id) if opp.company_id else None
    )
    contacts = (
        pipeline_repo.company_contacts(db, opp.company_id) if opp.company_id else []
    )
    proposal = pipeline_repo.accepted_proposal(db, opp.id)
    has_proposal = proposal is not None
    contracted_value = (
        proposal.value if has_proposal and proposal.value is not None
        else opp.estimated_value
    )

    logger.info(
        "opportunity_convert_prefill",
        opportunity_id=str(opp.id),
        actor_id=str(user.id),
        has_accepted_proposal=has_proposal,
    )
    return ConversionPrefill(
        opportunity_id=opp.id,
        company_id=opp.company_id,
        company_name=company.name if company else None,
        primary_contact_id=opp.primary_contact_id,
        contacts=[ConversionContact.model_validate(c) for c in contacts],
        accepted_proposal_id=proposal.id if has_proposal else None,
        contracted_value=contracted_value,
        has_accepted_proposal=has_proposal,
        verbal_close=not has_proposal,
    )
