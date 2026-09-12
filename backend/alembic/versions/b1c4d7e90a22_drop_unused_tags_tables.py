"""drop the unused tags / entity_tags tables

The tags feature was never wired up. `EntityTag` was declared and exported
from `app.models` but referenced by no service, repository or endpoint, and
the settings UI that created tags spoke to an in-memory mock rather than the
API ("INTEGRATION-GAP: no backend endpoint — tags CRUD is entirely on mock").
So tags could be created in the UI and attached to nothing, and no row ever
reached these tables.

Dropping them keeps the schema honest about what the application does. The
downgrade recreates both tables exactly as they were, so this is reversible;
there is no data to preserve either way.

Revision ID: b1c4d7e90a22
Revises: 4afe3baa1f84
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = "b1c4d7e90a22"
down_revision = "4afe3baa1f84"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # entity_tags first: it carries the FK onto tags.
    op.drop_index("ix_entity_tags_entity", table_name="entity_tags")
    op.drop_table("entity_tags")
    op.drop_table("tags")


def downgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.UniqueConstraint("name", name="uq_tag_name"),
    )
    op.create_table(
        "entity_tags",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tag_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", PG_UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "tag_id", "entity_type", "entity_id", name="uq_entity_tag"
        ),
    )
    op.create_index(
        "ix_entity_tags_entity", "entity_tags", ["entity_type", "entity_id"]
    )
