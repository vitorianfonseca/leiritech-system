"""Proposal templates and proposal structured content.

Templates are editable master data. Proposals SNAPSHOT (deep-copy) template
sections/items at instantiation, so editing a template never mutates existing
proposals. The reused ``catalog_unit`` / ``billing_type`` enums pass
``create_constraint=False`` here so SQLAlchemy does not emit a second CHECK
constraint with the same name as the one already created for ``catalog_items``.

Proposal-side tables (``ProposalSection`` / ``ProposalItem``) are added lower in
this module — they mirror the template children but hang off ``proposals``.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import ArchiveMixin, AuditBase
from app.models import enums


class ProposalTemplate(AuditBase, ArchiveMixin):
    __tablename__ = "proposal_templates"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_validity_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_discount_bps: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)

    sections: Mapped[list[ProposalTemplateSection]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="ProposalTemplateSection.position",
    )
    items: Mapped[list[ProposalTemplateItem]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="ProposalTemplateItem.position",
    )


class ProposalTemplateSection(AuditBase):
    __tablename__ = "proposal_template_sections"

    template_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("proposal_templates.id", ondelete="CASCADE"),
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heading: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")

    template: Mapped[ProposalTemplate] = relationship(back_populates="sections")


class ProposalTemplateItem(AuditBase):
    __tablename__ = "proposal_template_items"

    template_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("proposal_templates.id", ondelete="CASCADE"),
        index=True,
    )
    catalog_item_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("catalog_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(
        Enum(
            *enums.CATALOG_UNITS,
            name="catalog_unit",
            native_enum=False,
            create_constraint=False,
        ),
        nullable=False,
        default="unit",
    )
    unit_price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("23.00")
    )
    billing_type: Mapped[str] = mapped_column(
        Enum(
            *enums.BILLING_TYPES,
            name="billing_type",
            native_enum=False,
            create_constraint=False,
        ),
        nullable=False,
        default="one_time",
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("1")
    )

    template: Mapped[ProposalTemplate] = relationship(back_populates="items")


class ProposalSection(AuditBase):
    """Snapshot of a proposal's text sections (deep-copied from a template)."""

    __tablename__ = "proposal_sections"

    proposal_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("proposals.id", ondelete="CASCADE"),
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heading: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")

    proposal = relationship("Proposal", back_populates="sections")


class ProposalItem(AuditBase):
    """Snapshot of a proposal's priced line items. ``catalog_item_id`` is kept
    for traceability only (SET NULL if the catalog item is later deleted); the
    price/tax are frozen copies so the proposal is immutable to catalog edits."""

    __tablename__ = "proposal_items"

    proposal_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("proposals.id", ondelete="CASCADE"),
        index=True,
    )
    catalog_item_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("catalog_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(
        Enum(
            *enums.CATALOG_UNITS,
            name="catalog_unit",
            native_enum=False,
            create_constraint=False,
        ),
        nullable=False,
        default="unit",
    )
    unit_price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("23.00")
    )
    billing_type: Mapped[str] = mapped_column(
        Enum(
            *enums.BILLING_TYPES,
            name="billing_type",
            native_enum=False,
            create_constraint=False,
        ),
        nullable=False,
        default="one_time",
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("1")
    )

    proposal = relationship("Proposal", back_populates="items")
