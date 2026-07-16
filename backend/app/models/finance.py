"""Financial models: payment milestones and project costs.

INTERNAL ONLY, gated to Admin / Gestor-with-grant (BR-008, BR-065..073). No
fiscal document generation (SAF-T boundary). Money fields are integer EUR cents.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import BigInteger, Date, Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import AuditBase
from app.models import enums


class PaymentMilestone(AuditBase):
    __tablename__ = "payment_milestones"
    __table_args__ = (
        Index("ix_payment_milestones_project_status", "project_id", "status"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL")
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # EUR cents
    expected_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    invoiced_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    received_amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # cents
    completion_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmer_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # A neutral, non-fiscal external reference only (BR-070..073). NOT an invoice.
    external_invoice_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*enums.PAYMENT_MILESTONE_STATUSES, name="payment_milestone_status",
             native_enum=False),
        nullable=False,
        default="planned",
    )


class ProjectCost(AuditBase):
    """Minimal internal cost line-items backing margin math (BR-069/H8)."""

    __tablename__ = "project_costs"

    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # EUR cents
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
