"""CRM models: companies, contacts, pipeline stages, opportunities, proposals,
interactions, meetings.

Money fields are integer EUR cents. Trigram GIN indexes (pg_trgm) back global
search (F18); the ``pg_trgm`` extension is created by the initial migration.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import ArchiveMixin, AuditBase
from app.models import enums


class Company(AuditBase, ArchiveMixin):
    __tablename__ = "companies"
    __table_args__ = (
        Index(
            "ix_companies_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(128), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(128), nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(
        Enum(*enums.COMPANY_STATUSES, name="company_status", native_enum=False),
        nullable=False,
        default="potential",
    )
    # Derived flag (BR-062) — persisted for filtering; recomputed by service layer.
    is_active_client: Mapped[bool] = mapped_column(default=False, nullable=False)


class Contact(AuditBase, ArchiveMixin):
    __tablename__ = "contacts"
    __table_args__ = (
        Index(
            "ix_contacts_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    role_title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(
        Enum(*enums.CONTACT_STATUSES, name="contact_status", native_enum=False),
        nullable=False,
        default="active",
    )


class PipelineStage(AuditBase):
    __tablename__ = "pipeline_stages"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    win_probability: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100


class Opportunity(AuditBase, ArchiveMixin):
    __tablename__ = "opportunities"
    __table_args__ = (
        Index("ix_opportunities_stage_owner", "stage_id", "owner_id"),
        Index(
            "ix_opportunities_title_trgm",
            "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
    )

    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
    primary_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL")
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    stage_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("pipeline_stages.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    estimated_value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # EUR cents
    probability: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100
    expected_close_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_action: Mapped[str | None] = mapped_column(String(512), nullable=True)
    next_action_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    outcome: Mapped[str] = mapped_column(
        Enum(*enums.OPPORTUNITY_OUTCOMES, name="opportunity_outcome", native_enum=False),
        nullable=False,
        default="open",
    )
    lost_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    lost_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Proposal(AuditBase, ArchiveMixin):
    __tablename__ = "proposals"
    __table_args__ = (
        Index(
            "ix_proposals_reference_trgm",
            "reference",
            postgresql_using="gin",
            postgresql_ops={"reference": "gin_trgm_ops"},
        ),
    )

    opportunity_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="SET NULL"), index=True
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL")
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL")
    )
    reference: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # EUR cents
    created_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sent_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    pdf_attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("attachments.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*enums.PROPOSAL_STATUSES, name="proposal_status", native_enum=False),
        nullable=False,
        default="draft",
    )
    # Structured content (F-templates): snapshot of the template used, a
    # proposal-level discount, and the copied terms. Sections/items live in
    # dedicated tables and are deep-copied at instantiation.
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("proposal_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    discount_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)

    sections = relationship(
        "ProposalSection",
        back_populates="proposal",
        cascade="all, delete-orphan",
        order_by="ProposalSection.position",
    )
    items = relationship(
        "ProposalItem",
        back_populates="proposal",
        cascade="all, delete-orphan",
        order_by="ProposalItem.position",
    )


class Interaction(AuditBase):
    __tablename__ = "interactions"
    __table_args__ = (
        Index(
            "ix_interactions_body_trgm",
            "body",
            postgresql_using="gin",
            postgresql_ops={"body": "gin_trgm_ops"},
        ),
    )

    type: Mapped[str] = mapped_column(
        Enum(*enums.INTERACTION_TYPES, name="interaction_type", native_enum=False),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE")
    )
    opportunity_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="CASCADE")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE")
    )
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class Meeting(AuditBase):
    __tablename__ = "meetings"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    organizer_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL")
    )
    opportunity_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    outcome_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*enums.MEETING_STATUSES, name="meeting_status", native_enum=False),
        nullable=False,
        default="scheduled",
    )
