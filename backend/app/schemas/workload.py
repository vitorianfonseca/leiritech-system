"""Pydantic v2 schemas for workload / capacity computation (F13, BR-080..084).

Everything here is DERIVED, never stored: availability state, allocation and
utilization percentages, and the over-allocation flag are recomputed live from
each user's ``weekly_capacity_hours``, their role utilization target (BR-081),
their open task estimates (assigned load), and their billable logged time
(BR-083). The dashboard team-load chart consumes ``allocation_pct`` per member.

Hours are decimal hours; percentages are rounded to one decimal place.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# BR-082 availability states (+ manual PTO override "ausente"). ASCII keys are
# stable across the wire; the pt-PT accented labels are rendered client-side.
AvailabilityState = Literal[
    "disponivel",  # < BALANCED_MIN_PCT of net capacity allocated
    "equilibrado",  # BALANCED_MIN_PCT .. OVERALLOCATED_PCT
    "sobrecarregado",  # > OVERALLOCATED_PCT (over-allocated, BR-084)
    "ausente",  # manual PTO/away override (availability_override set)
]


class WorkloadEntry(BaseModel):
    """One member's derived workload snapshot (BR-080..084)."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    name: str
    role: str
    # Inputs
    weekly_capacity_hours: float
    role_utilization_target: float  # fraction, e.g. 0.80 (BR-081)
    # Derived capacity / allocation (BR-080/082)
    net_capacity_hours: float  # weekly_capacity × target
    allocated_hours: float  # Σ open task estimates assigned to the user
    available_hours: float  # net_capacity − allocated (may be negative)
    allocation_pct: float  # allocated / net_capacity × 100 (chart input)
    # Derived utilization from actuals (BR-083)
    billable_hours_week: float  # billable logged hours in the current ISO week
    utilization_pct: float  # billable / net_capacity × 100
    # Derived state (BR-082/084)
    availability_state: AvailabilityState
    over_allocated: bool
    availability_override: str | None


class TeamWorkload(BaseModel):
    """Team workload rollup (Admin/Gestor) or a single-member view (Membro)."""

    items: list[WorkloadEntry]
    total: int
    over_allocated_count: int
    generated_at: datetime


# --------------------------------------------------------------------------- #
# Per-role capacity config (BR-080/081, audit H16) — Admin-configurable,
# previously only settable via env vars.
# --------------------------------------------------------------------------- #
class RoleCapacityConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role: str
    weekly_capacity_hours: float
    utilization_target: float  # fraction 0..1
    internal_cost_rate_cents: int | None


class UpdateRoleCapacityConfigRequest(BaseModel):
    weekly_capacity_hours: float | None = None
    # Accepted as a percentage (1..100) from the client, matching the existing
    # capacity dialog's "utilizationTargetPct" field; stored as a 0..1 fraction.
    utilization_target_pct: float | None = None
    internal_cost_rate_cents: int | None = None
