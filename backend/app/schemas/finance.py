"""Pydantic v2 schemas for financial ops (F14 — internal only, BR-065..073).

Money is integer EUR cents throughout. Status literals mirror
``app.models.enums.PAYMENT_MILESTONE_STATUSES`` (the persisted English keys) so
invalid values are rejected with 422 at the edge before reaching the service.

Compliance boundary (BR-070/073): payment milestones are internal tracking only.
These schemas deliberately expose NO fiscal fields — no invoice number, no
tax/VAT breakdown, no ATCUD/QR — only a neutral ``external_invoice_ref`` note
recording that an external certified system issued the real invoice.

The lifecycle state machine (§1.7) and the margin computation (BR-065) live in
``finance_service``; these schemas only shape and validate payloads.
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Full persisted status set (read side).
PaymentMilestoneStatus = Literal[
    "planned",
    "invoiced",
    "partially_paid",
    "paid",
    "overdue",
    "cancelled",
]

# Statuses a caller may explicitly transition TO via the status endpoint.
# ``planned`` is the creation-only initial state and is never a transition target.
PaymentMilestoneTransition = Literal[
    "invoiced",
    "partially_paid",
    "paid",
    "overdue",
    "cancelled",
]


# --------------------------------------------------------------------------- #
# Payment milestones
# --------------------------------------------------------------------------- #
class PaymentMilestoneCreate(BaseModel):
    """Create a milestone in ``planned`` (BR-071: completion_criteria, amount and
    expected_date are mandatory; a confirmer is recorded on payment, not here)."""

    project_id: uuid.UUID
    company_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=2000)
    amount: int = Field(ge=0)  # EUR cents
    expected_date: date
    completion_criteria: str = Field(min_length=1, max_length=2000)
    reference: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)


class PaymentMilestoneUpdate(BaseModel):
    """Partial metadata update. Status is NOT settable here — lifecycle moves go
    through the dedicated status endpoint. Blocked once terminal (paid/cancelled).
    """

    company_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=2000)
    amount: int | None = Field(default=None, ge=0)
    expected_date: date | None = None
    completion_criteria: str | None = Field(default=None, min_length=1, max_length=2000)
    reference: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)


class PaymentMilestoneStatusChange(BaseModel):
    """Drive one lifecycle transition (§1.7). Guards (received reconciliation,
    external reference, cancel reason, overdue date) are enforced service-side."""

    status: PaymentMilestoneTransition
    # Cumulative received (cents) — required for partially_paid / paid.
    received_amount: int | None = Field(default=None, ge=0)
    # BR-073 — neutral note that an external certified system issued the invoice.
    external_invoice_ref: str | None = Field(default=None, max_length=128)
    paid_date: date | None = None
    # Cancellation / write-off reason (H3) — required when cancelling.
    reason: str | None = Field(default=None, max_length=2000)


class PaymentMilestoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    company_id: uuid.UUID | None
    description: str | None
    amount: int  # EUR cents
    expected_date: date | None
    invoiced_date: date | None
    paid_date: date | None
    received_amount: int
    completion_criteria: str | None
    confirmer_id: uuid.UUID | None
    external_invoice_ref: str | None
    reference: str | None
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Project costs (BR-069 / H8) — internal cost lines backing margin
# --------------------------------------------------------------------------- #
class ProjectCostCreate(BaseModel):
    project_id: uuid.UUID
    description: str = Field(min_length=1, max_length=512)
    amount: int = Field(ge=0)  # EUR cents
    # ``dt.date`` (module-qualified) so the ``date`` field name does not shadow
    # the ``date`` type during annotation evaluation.
    date: dt.date | None = None


class ProjectCostUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=512)
    amount: int | None = Field(default=None, ge=0)
    date: dt.date | None = None


class ProjectCostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    description: str
    amount: int  # EUR cents
    date: dt.date | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Live margin + financial summary (BR-065)
# --------------------------------------------------------------------------- #
class ProjectFinancialSummary(BaseModel):
    """Per-project financial rollup (F14). All amounts EUR cents.

    margin = contracted − labor_cost − costs_total, where
    labor_cost = Σ logged hours × internal_cost_rate (BR-065). Computed live.
    """

    project_id: uuid.UUID
    contracted: int
    received: int
    pending: int
    # Margin breakdown
    internal_cost_rate: int  # cents/hour (0 when unset)
    logged_hours: float
    labor_cost: int
    costs_total: int
    margin: int
    milestone_count: int
