"""Pydantic v2 schemas for proposals (F6 — metadata + PDF lifecycle).

Money is integer EUR cents. Status literals mirror ``app.models.enums`` (the
persisted English keys) so invalid values are rejected with a 422 at the edge
before reaching the service layer. The lifecycle state-machine guards (BR-025
send prerequisites, BR-026 terminal states, BR-027 auto-expiry, BR-028 archive
rules) live in ``proposal_service`` where they have database context; these
schemas only shape and validate the payloads.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.proposal_templates import (
    ItemInput as ContentItemInput,
    ItemResponse as ContentItemResponse,
    SectionInput as ContentSectionInput,
    SectionResponse as ContentSectionResponse,
    TotalsResponse as ContentTotalsResponse,
)

ProposalStatus = Literal[
    "draft", "sent", "viewed", "accepted", "rejected", "expired"
]


class ProposalCreate(BaseModel):
    """Create a proposal in ``draft`` (BR-025 — send prerequisites are only
    enforced at the ``send`` transition, so draft creation is permissive)."""

    reference: str = Field(min_length=1, max_length=64)
    opportunity_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    value: int | None = Field(default=None, ge=0)  # EUR cents
    created_date: date | None = None
    valid_until: date | None = None
    pdf_attachment_id: uuid.UUID | None = None
    notes: str | None = None


class ProposalUpdate(BaseModel):
    """Partial update of metadata. Lifecycle transitions (send/view/accept/
    reject/expire/resend) have dedicated endpoints and are NOT settable here.
    Blocked once the proposal reaches a terminal state (BR-026)."""

    reference: str | None = Field(default=None, min_length=1, max_length=64)
    opportunity_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    value: int | None = Field(default=None, ge=0)
    created_date: date | None = None
    valid_until: date | None = None
    pdf_attachment_id: uuid.UUID | None = None
    notes: str | None = None


class ProposalReject(BaseModel):
    """Mark a proposal rejected. The state machine requires a rejection note."""

    note: str = Field(min_length=1, max_length=512)


class ProposalResend(BaseModel):
    """Resend an expired proposal (``expired`` → ``sent``) extending validity."""

    valid_until: date
    pdf_attachment_id: uuid.UUID | None = None


class ApplyTemplateInput(BaseModel):
    """Instantiate a template into a draft proposal (deep-copy snapshot)."""

    template_id: uuid.UUID


class ProposalContentInput(BaseModel):
    """Replace a draft proposal's structured content (sections/items/terms)."""

    discount_bps: int = Field(default=0, ge=0, le=10000)
    terms: str | None = None
    sections: list[ContentSectionInput] = Field(default_factory=list)
    items: list[ContentItemInput] = Field(default_factory=list)


class ProposalContentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    discount_bps: int
    terms: str | None
    sections: list[ContentSectionResponse]
    items: list[ContentItemResponse]
    totals: ContentTotalsResponse | None = None


class ProposalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reference: str
    opportunity_id: uuid.UUID | None
    company_id: uuid.UUID | None
    contact_id: uuid.UUID | None
    value: int | None  # EUR cents
    created_date: date | None
    sent_date: date | None
    valid_until: date | None
    pdf_attachment_id: uuid.UUID | None
    notes: str | None
    status: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
