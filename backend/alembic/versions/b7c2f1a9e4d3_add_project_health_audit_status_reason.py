"""add project health audit + status_reason (F8, BR-031/BR-053)

Adds the persisted override reason and publish audit for project health
(BR-030/031) plus the lifecycle status_reason captured on pause/cancel
(BR-053, WORKFLOW_SPEC §1.3).

Revision ID: b7c2f1a9e4d3
Revises: a4489baf8714
Create Date: 2026-07-17 03:05:00.000000
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7c2f1a9e4d3'
down_revision: str | None = 'a4489baf8714'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('health_reason', sa.Text(), nullable=True))
    op.add_column(
        'projects',
        sa.Column('health_published_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'projects',
        sa.Column(
            'health_published_by',
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        'fk_projects_health_published_by_users',
        'projects',
        'users',
        ['health_published_by'],
        ['id'],
        ondelete='SET NULL',
    )
    op.add_column('projects', sa.Column('status_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'status_reason')
    op.drop_constraint(
        'fk_projects_health_published_by_users', 'projects', type_='foreignkey'
    )
    op.drop_column('projects', 'health_published_by')
    op.drop_column('projects', 'health_published_at')
    op.drop_column('projects', 'health_reason')
