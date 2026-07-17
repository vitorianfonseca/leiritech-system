"""Proposal-template business logic. Writes are Gestor+ (enforced at the route);
reads are open to any authenticated user. Sections/items are replace-on-save.
``to_response`` attaches the server-computed totals block.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core import errors
from app.models.proposal_content import (
    ProposalTemplate,
    ProposalTemplateItem,
    ProposalTemplateSection,
)
from app.models.user import User
from app.repositories import proposal_templates as tpl_repo
from app.schemas.proposal_templates import (
    GroupTotalResponse,
    ProposalTemplateCreate,
    ProposalTemplateResponse,
    ProposalTemplateUpdate,
    TotalsResponse,
)
from app.services import proposal_totals


def totals_to_schema(t: proposal_totals.Totals) -> TotalsResponse:
    return TotalsResponse(
        one_time=GroupTotalResponse(**t.one_time.__dict__),
        monthly=GroupTotalResponse(**t.monthly.__dict__),
        annual=GroupTotalResponse(**t.annual.__dict__),
        value=t.value,
    )


def get_or_404(db: Session, template_id: uuid.UUID) -> ProposalTemplate:
    tpl = tpl_repo.get(db, template_id)
    if tpl is None:
        raise errors.not_found(
            "Template de proposta não encontrado.", code="PROPOSAL_TEMPLATE_NOT_FOUND"
        )
    return tpl


def template_totals(tpl: ProposalTemplate) -> proposal_totals.Totals:
    lines = [
        proposal_totals.LineInput(
            quantity=Decimal(it.quantity),
            unit_price=it.unit_price,
            tax_rate=Decimal(it.tax_rate),
            billing_type=it.billing_type,
        )
        for it in tpl.items
    ]
    return proposal_totals.compute_totals(lines, discount_bps=tpl.default_discount_bps)


def to_response(tpl: ProposalTemplate) -> ProposalTemplateResponse:
    response = ProposalTemplateResponse.model_validate(tpl)
    return response.model_copy(update={"totals": totals_to_schema(template_totals(tpl))})


def _apply_children(tpl: ProposalTemplate, payload) -> None:
    if payload.sections is not None:
        tpl.sections = [
            ProposalTemplateSection(position=i, heading=s.heading, body=s.body)
            for i, s in enumerate(payload.sections)
        ]
    if payload.items is not None:
        tpl.items = [
            ProposalTemplateItem(
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


def create_template(
    db: Session, user: User, payload: ProposalTemplateCreate
) -> ProposalTemplate:
    tpl = ProposalTemplate(
        created_by=user.id,
        name=payload.name,
        description=payload.description,
        default_validity_days=payload.default_validity_days,
        default_discount_bps=payload.default_discount_bps,
        terms=payload.terms,
    )
    _apply_children(tpl, payload)
    db.add(tpl)
    db.flush()
    return get_or_404(db, tpl.id)


def update_template(
    db: Session, user: User, template_id: uuid.UUID, payload: ProposalTemplateUpdate
) -> ProposalTemplate:
    tpl = get_or_404(db, template_id)
    for field in (
        "name",
        "description",
        "default_validity_days",
        "default_discount_bps",
        "terms",
    ):
        value = getattr(payload, field)
        if value is not None:
            setattr(tpl, field, value)
    _apply_children(tpl, payload)
    db.flush()
    return get_or_404(db, template_id)


def archive_template(
    db: Session, user: User, template_id: uuid.UUID
) -> ProposalTemplate:
    tpl = get_or_404(db, template_id)
    tpl.archived_at = datetime.now(UTC)
    db.flush()
    return tpl


def restore_template(
    db: Session, user: User, template_id: uuid.UUID
) -> ProposalTemplate:
    tpl = get_or_404(db, template_id)
    tpl.archived_at = None
    db.flush()
    return tpl


def list_templates(db: Session, user: User, **filters):
    return tpl_repo.list_templates(db, **filters)
