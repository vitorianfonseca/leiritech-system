"""Proposal business logic (F6 — metadata + PDF lifecycle, BR-025..028).

All proposal mutations flow through here so the lifecycle state machine
(§1.2), the send prerequisites (BR-025: PDF + value + valid_until), the terminal
states (BR-026: accepted/rejected cannot change), auto-expiry (BR-027/AUTO-04),
the archive rules (BR-028: accepted proposals cannot be archived), the Membro
visibility boundary (BR-002) and the audit trail (BR-064) are enforced in
exactly one place. Route handlers stay thin: authenticate, delegate, serialize.

Win-flow seam (BR-035): accepting a proposal does NOT auto-win/convert the
linked opportunity. An accepted proposal is what the won→project conversion
reads (``opportunity_service.convert_opportunity`` via
``pipeline_repo.accepted_proposal``); winning and converting stay explicit
Gestor actions in the opportunity domain so verbal closes remain possible. We
intentionally do not mutate the opportunity here to avoid duplicating that
logic — only guard that the linked opportunity is not already lost.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import Role, role_at_least
from app.models.collaboration import Attachment, Notification
from app.models.crm import Company, Opportunity, Proposal
from app.models.proposal_content import ProposalItem, ProposalSection
from app.models.user import User
from app.repositories import proposals as proposal_repo
from app.schemas.proposals import (
    ProposalContentInput,
    ProposalCreate,
    ProposalReject,
    ProposalResend,
    ProposalUpdate,
)
from app.services import (
    activity_service,
    notification_service,
    proposal_placeholders,
    proposal_template_service,
    proposal_totals,
)

logger = structlog.get_logger("aurea.proposal")

ENTITY_TYPE = "proposal"

# accepted/rejected are terminal (BR-026 — renegotiation is a new record).
_TERMINAL_STATUSES = ("accepted", "rejected")

_SNAPSHOT_FIELDS = (
    "reference",
    "opportunity_id",
    "company_id",
    "contact_id",
    "value",
    "created_date",
    "sent_date",
    "valid_until",
    "pdf_attachment_id",
    "status",
)


def _snapshot(proposal: Proposal) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in _SNAPSHOT_FIELDS:
        value = getattr(proposal, field)
        if isinstance(value, uuid.UUID | date | datetime):
            value = str(value)
        out[field] = value
    return out


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #
def get_proposal_or_404(
    db: Session, user: User, proposal_id: uuid.UUID
) -> Proposal:
    """Load a proposal, enforcing the Membro visibility boundary.

    A Membro requesting a proposal outside their scope gets 404 (not 403) so
    they cannot enumerate records they are not attached to (BR-002).
    """
    proposal = db.get(Proposal, proposal_id)
    if proposal is None:
        raise errors.not_found("Proposta não encontrada.", code="PROPOSAL_NOT_FOUND")
    if _is_membro(user) and not proposal_repo.membro_can_see_proposal(
        db, user.id, proposal
    ):
        raise errors.not_found("Proposta não encontrada.", code="PROPOSAL_NOT_FOUND")
    return proposal


def list_proposals(
    db: Session,
    user: User,
    *,
    opportunity_id: uuid.UUID | None,
    company_id: uuid.UUID | None,
    status: str | None,
    q: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Proposal], int]:
    scope_filter = (
        proposal_repo.membro_proposal_filter(user.id) if _is_membro(user) else None
    )
    return proposal_repo.list_proposals(
        db,
        scope_filter=scope_filter,
        opportunity_id=opportunity_id,
        company_id=company_id,
        status=status,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )


# --------------------------------------------------------------------------- #
# Validation helpers
# --------------------------------------------------------------------------- #
def _validate_opportunity(db: Session, opportunity_id: uuid.UUID | None) -> None:
    if opportunity_id is not None and db.get(Opportunity, opportunity_id) is None:
        raise errors.bad_request("Oportunidade inválida.", code="OPPORTUNITY_NOT_FOUND")


def _validate_company(db: Session, company_id: uuid.UUID | None) -> None:
    if company_id is not None and db.get(Company, company_id) is None:
        raise errors.bad_request("Empresa inválida.", code="COMPANY_NOT_FOUND")


def _validate_attachment(db: Session, attachment_id: uuid.UUID | None) -> None:
    if attachment_id is not None and db.get(Attachment, attachment_id) is None:
        raise errors.bad_request("Anexo inválido.", code="ATTACHMENT_NOT_FOUND")


def _assert_not_terminal(proposal: Proposal) -> None:
    """BR-026: accepted/rejected proposals are frozen — create a new record for
    renegotiation. Blocks both metadata edits and further transitions."""
    if proposal.status in _TERMINAL_STATUSES:
        raise errors.conflict(
            "Proposta aceite ou recusada não pode ser alterada. "
            "Crie uma nova proposta.",
            code="PROPOSAL_TERMINAL",
        )


def _linked_opportunity(db: Session, proposal: Proposal) -> Opportunity | None:
    if proposal.opportunity_id is None:
        return None
    return db.get(Opportunity, proposal.opportunity_id)


def _assert_opportunity_not_lost(db: Session, proposal: Proposal) -> None:
    opp = _linked_opportunity(db, proposal)
    if opp is not None and opp.outcome == "lost":
        raise errors.conflict(
            "A oportunidade associada foi perdida; a proposta não pode avançar.",
            code="OPPORTUNITY_LOST",
        )


def _owner_id(db: Session, proposal: Proposal) -> uuid.UUID | None:
    """The proposal 'owner' for notifications (AUTO-04): the linked
    opportunity's owner when set, otherwise whoever created the proposal."""
    opp = _linked_opportunity(db, proposal)
    if opp is not None and opp.owner_id is not None:
        return opp.owner_id
    return proposal.created_by


# --------------------------------------------------------------------------- #
# Writes
# --------------------------------------------------------------------------- #
def create_proposal(db: Session, user: User, payload: ProposalCreate) -> Proposal:
    if proposal_repo.get_by_reference(db, payload.reference) is not None:
        raise errors.conflict(
            "Já existe uma proposta com esta referência.",
            code="PROPOSAL_REFERENCE_EXISTS",
        )
    _validate_opportunity(db, payload.opportunity_id)
    _validate_company(db, payload.company_id)
    _validate_attachment(db, payload.pdf_attachment_id)

    proposal = Proposal(
        reference=payload.reference,
        opportunity_id=payload.opportunity_id,
        company_id=payload.company_id,
        contact_id=payload.contact_id,
        value=payload.value,
        created_date=payload.created_date or date.today(),
        valid_until=payload.valid_until,
        pdf_attachment_id=payload.pdf_attachment_id,
        notes=payload.notes,
        status="draft",
        created_by=user.id,
    )
    db.add(proposal)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=proposal.id,
        action="proposal.created",
        actor_id=user.id,
        after=_snapshot(proposal),
    )
    logger.info("proposal_created", proposal_id=str(proposal.id), actor_id=str(user.id))
    return proposal


def update_proposal(
    db: Session, user: User, proposal_id: uuid.UUID, payload: ProposalUpdate
) -> Proposal:
    proposal = get_proposal_or_404(db, user, proposal_id)
    _assert_not_terminal(proposal)  # BR-026 — frozen once decided
    before = _snapshot(proposal)
    changes = payload.model_dump(exclude_unset=True)

    if "reference" in changes and changes["reference"] != proposal.reference:
        existing = proposal_repo.get_by_reference(db, changes["reference"])
        if existing is not None and existing.id != proposal.id:
            raise errors.conflict(
                "Já existe uma proposta com esta referência.",
                code="PROPOSAL_REFERENCE_EXISTS",
            )
    if "opportunity_id" in changes:
        _validate_opportunity(db, changes["opportunity_id"])
    if "company_id" in changes:
        _validate_company(db, changes["company_id"])
    if "pdf_attachment_id" in changes:
        _validate_attachment(db, changes["pdf_attachment_id"])

    for field, value in changes.items():
        setattr(proposal, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=proposal.id,
        action="proposal.updated",
        actor_id=user.id,
        before=before,
        after=_snapshot(proposal),
    )
    logger.info(
        "proposal_updated",
        proposal_id=str(proposal.id),
        actor_id=str(user.id),
        fields=sorted(changes.keys()),
    )
    return proposal


# --------------------------------------------------------------------------- #
# Lifecycle transitions (§1.2 state machine)
# --------------------------------------------------------------------------- #
def _transition(
    db: Session,
    user: User,
    proposal: Proposal,
    *,
    new_status: str,
    action: str,
    extra_after: dict[str, Any] | None = None,
) -> Proposal:
    before = _snapshot(proposal)
    proposal.status = new_status
    db.flush()
    after = _snapshot(proposal)
    if extra_after:
        after = {**after, **extra_after}
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=proposal.id,
        action=action,
        actor_id=user.id,
        before=before,
        after=after,
    )
    logger.info(
        action.replace(".", "_"),
        proposal_id=str(proposal.id),
        actor_id=str(user.id),
    )
    return proposal


def send_proposal(db: Session, user: User, proposal_id: uuid.UUID) -> Proposal:
    """draft/expired → sent. BR-025: requires an attached PDF, a value and a
    valid_until date; the linked opportunity must not be lost."""
    proposal = get_proposal_or_404(db, user, proposal_id)
    if proposal.status not in ("draft", "expired"):
        raise errors.conflict(
            "Só uma proposta em rascunho ou expirada pode ser enviada.",
            code="PROPOSAL_INVALID_TRANSITION",
        )
    missing = [
        name
        for name, value in (
            ("pdf_attachment_id", proposal.pdf_attachment_id),
            ("value", proposal.value),
            ("valid_until", proposal.valid_until),
        )
        if value is None
    ]
    if missing:
        raise errors.ApiError(
            status_code=422,
            code="PROPOSAL_SEND_REQUIREMENTS",
            message="Anexe o PDF e defina o valor e a validade antes de enviar.",
            details={"missing": missing},
        )
    _assert_opportunity_not_lost(db, proposal)
    proposal.sent_date = date.today()
    return _transition(
        db, user, proposal, new_status="sent", action="proposal.sent"
    )


def mark_viewed(db: Session, user: User, proposal_id: uuid.UUID) -> Proposal:
    """sent → viewed (recipient opened / manual mark)."""
    proposal = get_proposal_or_404(db, user, proposal_id)
    if proposal.status == "viewed":
        return proposal  # idempotent
    if proposal.status != "sent":
        raise errors.conflict(
            "A proposta tem de estar enviada para ser marcada como visualizada.",
            code="PROPOSAL_INVALID_TRANSITION",
        )
    return _transition(
        db, user, proposal, new_status="viewed", action="proposal.viewed"
    )


def accept_proposal(db: Session, user: User, proposal_id: uuid.UUID) -> Proposal:
    """sent/viewed → accepted (terminal, BR-026). The linked opportunity must
    not be lost. This does NOT win/convert the opportunity (win-flow seam)."""
    proposal = get_proposal_or_404(db, user, proposal_id)
    if proposal.status not in ("sent", "viewed"):
        raise errors.conflict(
            "Só uma proposta enviada ou visualizada pode ser aceite.",
            code="PROPOSAL_INVALID_TRANSITION",
        )
    _assert_opportunity_not_lost(db, proposal)
    result = _transition(
        db, user, proposal, new_status="accepted", action="proposal.accepted"
    )
    # Event notification (F15): tell the proposal owner it was accepted.
    owner_id = _owner_id(db, proposal)
    if owner_id is not None and owner_id != user.id:
        notification_service.create_notification(
            db,
            user_id=owner_id,
            type="proposal_accepted",
            body=f"Proposta «{proposal.reference}» foi aceite.",
            entity_type=ENTITY_TYPE,
            entity_id=proposal.id,
        )
    return result


def reject_proposal(
    db: Session, user: User, proposal_id: uuid.UUID, payload: ProposalReject
) -> Proposal:
    """sent/viewed → rejected (terminal, BR-026). A rejection note is required."""
    proposal = get_proposal_or_404(db, user, proposal_id)
    if proposal.status not in ("sent", "viewed"):
        raise errors.conflict(
            "Só uma proposta enviada ou visualizada pode ser recusada.",
            code="PROPOSAL_INVALID_TRANSITION",
        )
    return _transition(
        db,
        user,
        proposal,
        new_status="rejected",
        action="proposal.rejected",
        extra_after={"note": payload.note},
    )


def expire_proposal(db: Session, user: User, proposal_id: uuid.UUID) -> Proposal:
    """sent/viewed → expired (manual). AUTO-04 does this automatically for
    proposals past validity; this is the Gestor's manual override."""
    proposal = get_proposal_or_404(db, user, proposal_id)
    if proposal.status not in ("sent", "viewed"):
        raise errors.conflict(
            "Só uma proposta enviada ou visualizada pode expirar.",
            code="PROPOSAL_INVALID_TRANSITION",
        )
    return _transition(
        db, user, proposal, new_status="expired", action="proposal.expired"
    )


def resend_proposal(
    db: Session, user: User, proposal_id: uuid.UUID, payload: ProposalResend
) -> Proposal:
    """expired → sent, extending validity with a new valid_until (and optionally
    a fresh PDF). The new validity must be in the future."""
    proposal = get_proposal_or_404(db, user, proposal_id)
    if proposal.status != "expired":
        raise errors.conflict(
            "Só uma proposta expirada pode ser reenviada.",
            code="PROPOSAL_INVALID_TRANSITION",
        )
    if payload.valid_until <= date.today():
        raise errors.ApiError(
            status_code=422,
            code="PROPOSAL_VALIDITY_IN_PAST",
            message="A nova validade tem de ser uma data futura.",
        )
    _assert_opportunity_not_lost(db, proposal)
    if payload.pdf_attachment_id is not None:
        _validate_attachment(db, payload.pdf_attachment_id)
        proposal.pdf_attachment_id = payload.pdf_attachment_id
    proposal.valid_until = payload.valid_until
    proposal.sent_date = date.today()
    return _transition(
        db, user, proposal, new_status="sent", action="proposal.resent"
    )


# --------------------------------------------------------------------------- #
# Archive / restore (BR-028 / BR-060)
# --------------------------------------------------------------------------- #
def archive_proposal(db: Session, user: User, proposal_id: uuid.UUID) -> Proposal:
    """Soft-delete a proposal. BR-028/H2: an accepted proposal cannot be
    archived because it is permanently linked to its project (BR-036)."""
    proposal = get_proposal_or_404(db, user, proposal_id)
    if proposal.archived_at is not None:
        return proposal  # idempotent
    if proposal.status == "accepted":
        raise errors.conflict(
            "Proposta aceite está associada a um projeto e não pode ser arquivada.",
            code="PROPOSAL_ARCHIVE_BLOCKED",
        )
    proposal.archived_at = datetime.now(tz=UTC)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=proposal.id,
        action="proposal.archived",
        actor_id=user.id,
    )
    logger.info("proposal_archived", proposal_id=str(proposal.id), actor_id=str(user.id))
    return proposal


def restore_proposal(db: Session, user: User, proposal_id: uuid.UUID) -> Proposal:
    proposal = db.get(Proposal, proposal_id)
    if proposal is None:
        raise errors.not_found("Proposta não encontrada.", code="PROPOSAL_NOT_FOUND")
    if proposal.archived_at is not None:
        proposal.archived_at = None
        db.flush()
        activity_service.record(
            db,
            entity_type=ENTITY_TYPE,
            entity_id=proposal.id,
            action="proposal.restored",
            actor_id=user.id,
        )
        logger.info(
            "proposal_restored", proposal_id=str(proposal.id), actor_id=str(user.id)
        )
    return proposal


# --------------------------------------------------------------------------- #
# Auto-expiry (AUTO-04 / BR-027) — callable from the cron entrypoint
# --------------------------------------------------------------------------- #
def expire_overdue_proposals(
    db: Session, *, today: date | None = None
) -> list[Proposal]:
    """Transition every ``sent``/``viewed`` proposal past its ``valid_until`` to
    ``expired`` and notify its owner (AUTO-04 / BR-027).

    Returns the proposals that were expired. Idempotent: proposals already
    expired/terminal are skipped by the query. Does NOT commit — the caller owns
    the transaction (the CLI entrypoint commits; tests can roll back).
    """
    today = today or date.today()
    overdue = proposal_repo.overdue_open_proposals(db, today=today)
    for proposal in overdue:
        before = _snapshot(proposal)
        proposal.status = "expired"
        db.flush()
        activity_service.record(
            db,
            entity_type=ENTITY_TYPE,
            entity_id=proposal.id,
            action="proposal.expired",
            actor_id=None,  # system action (AUTO-04)
            before=before,
            after=_snapshot(proposal),
        )
        owner_id = _owner_id(db, proposal)
        if owner_id is not None:
            db.add(
                Notification(
                    user_id=owner_id,
                    type="proposal_expired",
                    entity_type=ENTITY_TYPE,
                    entity_id=proposal.id,
                    body=(
                        f"Proposta «{proposal.reference}» expirou em "
                        f"{proposal.valid_until}."
                    ),
                )
            )
        logger.info(
            "proposal_auto_expired",
            proposal_id=str(proposal.id),
            reference=proposal.reference,
            valid_until=str(proposal.valid_until),
        )
    logger.info("proposal_expiry_run", expired_count=len(overdue), run_date=str(today))
    return overdue


# --------------------------------------------------------------------------- #
# Structured content (templates instantiation, editing, totals)
# --------------------------------------------------------------------------- #
def _proposal_lines(proposal: Proposal) -> list[proposal_totals.LineInput]:
    return [
        proposal_totals.LineInput(
            quantity=Decimal(it.quantity),
            unit_price=it.unit_price,
            tax_rate=Decimal(it.tax_rate),
            billing_type=it.billing_type,
        )
        for it in proposal.items
    ]


def _recompute_value(proposal: Proposal) -> None:
    """proposals.value = one-time net total (excl. IVA), keeping the lifecycle
    (BR-025..028) and dashboard consistent with the structured content."""
    totals = proposal_totals.compute_totals(
        _proposal_lines(proposal), discount_bps=proposal.discount_bps
    )
    proposal.value = totals.value


def _require_draft(proposal: Proposal) -> None:
    if proposal.status != "draft":
        raise errors.conflict(
            "O conteúdo só pode ser editado enquanto a proposta está em rascunho.",
            code="PROPOSAL_NOT_DRAFT",
        )


def _placeholder_context(db: Session, proposal: Proposal) -> dict[str, str | None]:
    company = db.get(Company, proposal.company_id) if proposal.company_id else None
    today = date.today()
    return {
        "cliente": company.name if company else None,
        "empresa": company.name if company else None,
        "data": today.strftime("%d/%m/%Y"),
        "validade": proposal.valid_until.strftime("%d/%m/%Y")
        if proposal.valid_until
        else None,
        "referencia": proposal.reference,
    }


def apply_template(
    db: Session, user: User, proposal_id: uuid.UUID, template_id: uuid.UUID
) -> Proposal:
    """Deep-copy a template into a DRAFT proposal, snapshotting catalog prices
    and resolving placeholders. Editing the template afterwards never mutates
    this proposal (BR — snapshot integrity)."""
    proposal = get_proposal_or_404(db, user, proposal_id)
    _require_draft(proposal)
    tpl = proposal_template_service.get_or_404(db, template_id)

    proposal.template_id = tpl.id
    proposal.discount_bps = tpl.default_discount_bps
    if tpl.default_validity_days is not None:
        proposal.valid_until = date.today() + timedelta(days=tpl.default_validity_days)

    ctx = _placeholder_context(db, proposal)
    proposal.terms = (
        proposal_placeholders.resolve(tpl.terms, ctx) if tpl.terms else None
    )
    proposal.sections = [
        ProposalSection(
            position=s.position,
            heading=s.heading,
            body=proposal_placeholders.resolve(s.body, ctx),
        )
        for s in tpl.sections
    ]
    proposal.items = [
        ProposalItem(
            position=it.position,
            catalog_item_id=it.catalog_item_id,
            name=it.name,
            unit=it.unit,
            unit_price=it.unit_price,
            tax_rate=it.tax_rate,
            billing_type=it.billing_type,
            quantity=it.quantity,
        )
        for it in tpl.items
    ]
    _recompute_value(proposal)
    db.flush()
    return get_proposal_or_404(db, user, proposal_id)


def set_content(
    db: Session, user: User, proposal_id: uuid.UUID, payload: ProposalContentInput
) -> Proposal:
    proposal = get_proposal_or_404(db, user, proposal_id)
    _require_draft(proposal)
    proposal.discount_bps = payload.discount_bps
    proposal.terms = payload.terms
    proposal.sections = [
        ProposalSection(position=i, heading=s.heading, body=s.body)
        for i, s in enumerate(payload.sections)
    ]
    proposal.items = [
        ProposalItem(
            position=i,
            catalog_item_id=it.catalog_item_id,
            name=it.name,
            unit=it.unit,
            unit_price=it.unit_price,
            tax_rate=it.tax_rate,
            billing_type=it.billing_type,
            quantity=it.quantity,
        )
        for i, it in enumerate(payload.items)
    ]
    _recompute_value(proposal)
    db.flush()
    return get_proposal_or_404(db, user, proposal_id)


def get_content(db: Session, user: User, proposal_id: uuid.UUID):
    from app.schemas.proposals import ProposalContentResponse

    proposal = get_proposal_or_404(db, user, proposal_id)
    totals = proposal_totals.compute_totals(
        _proposal_lines(proposal), discount_bps=proposal.discount_bps
    )
    response = ProposalContentResponse.model_validate(proposal)
    return response.model_copy(
        update={"totals": proposal_template_service.totals_to_schema(totals)}
    )
