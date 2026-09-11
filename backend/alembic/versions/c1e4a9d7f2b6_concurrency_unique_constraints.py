"""concurrency unique constraints (audit C14, H4)

Adds DB-level backstops for two race conditions found in the forge-audit:
- C14: two concurrent "Converter em projeto" calls on the same won opportunity
  could create two projects (no uniqueness on projects.opportunity_id).
- H4: two proposals on the same opportunity could both reach "accepted"
  simultaneously, since accepted_proposal() just picked "most recent".

Both are partial unique indexes so they only constrain the meaningful state
(a live, opportunity-linked project; an accepted proposal) without blocking
legitimate historical duplicates (archived projects, non-accepted proposals).

Revision ID: c1e4a9d7f2b6
Revises: f292f3685537
Create Date: 2026-09-11 00:00:00.000000
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c1e4a9d7f2b6'
down_revision: str | None = 'f292f3685537'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        'uq_projects_opportunity_live',
        'projects',
        ['opportunity_id'],
        unique=True,
        postgresql_where='opportunity_id IS NOT NULL AND archived_at IS NULL',
    )
    op.create_index(
        'uq_proposals_accepted_per_opportunity',
        'proposals',
        ['opportunity_id'],
        unique=True,
        postgresql_where="status = 'accepted'",
    )


def downgrade() -> None:
    op.drop_index('uq_proposals_accepted_per_opportunity', table_name='proposals')
    op.drop_index('uq_projects_opportunity_live', table_name='projects')
