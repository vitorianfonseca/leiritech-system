"""Report aggregate response models (F19).

Four report groups — commercial, projects, team, financial — each a live
read-only rollup derived from the domain tables. Money is integer EUR cents.
State/enum values are the stable English keys persisted by the models. The
financial group is BR-008-gated at the route layer; nothing here is cached.

These are backend-native aggregates (snake_case), independent of any frontend
contract — the reports UI aggregates raw stores client-side. The management
dashboard (F2) has its own camelCase contract in ``app.schemas.dashboard``.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ReportMeta(BaseModel):
    """Envelope metadata shared by every report (scope + snapshot instant)."""

    generated_at: datetime
    scope: str  # "full" (Admin/Gestor) | "own" (Membro)
    from_date: str | None = None
    to_date: str | None = None


# --------------------------------------------------------------------------- #
# Commercial (pipeline / opportunities / win-rate)
# --------------------------------------------------------------------------- #
class PipelineStageRow(BaseModel):
    stage_id: uuid.UUID | None
    stage: str
    order_index: int
    count: int
    value: int  # Σ estimated_value of OPEN opportunities in the stage (cents)


class CommercialReport(BaseModel):
    meta: ReportMeta
    open_count: int
    won_count: int
    lost_count: int
    total_count: int
    win_rate: float  # won / (won + lost); 0.0 when no decided opportunities
    open_pipeline_value: int  # Σ estimated_value of open opportunities (cents)
    weighted_pipeline_value: int  # Σ estimated_value × probability/100 (cents)
    by_stage: list[PipelineStageRow]


# --------------------------------------------------------------------------- #
# Projects (health / throughput / on-time)
# --------------------------------------------------------------------------- #
class ProjectHealthCounts(BaseModel):
    healthy: int
    attention: int
    at_risk: int
    unset: int


class ProjectsReport(BaseModel):
    meta: ReportMeta
    total: int
    active: int
    completed: int
    on_hold: int
    at_risk: int  # published_health == "at_risk"
    health: ProjectHealthCounts
    on_time_rate: float  # completed on/before deadline ÷ completed with a deadline
    completed_on_time: int
    completed_late: int


# --------------------------------------------------------------------------- #
# Team (workload / utilization)
# --------------------------------------------------------------------------- #
class TeamMemberRow(BaseModel):
    user_id: uuid.UUID
    name: str
    role: str
    allocation_pct: float
    utilization_pct: float
    availability_state: str
    over_allocated: bool


class TeamReport(BaseModel):
    meta: ReportMeta
    members: list[TeamMemberRow]
    member_count: int
    over_allocated_count: int
    avg_allocation_pct: float
    avg_utilization_pct: float


# --------------------------------------------------------------------------- #
# Financial (contracted / received / pending / margin) — BR-008 gated
# --------------------------------------------------------------------------- #
class FinancialProjectRow(BaseModel):
    project_id: uuid.UUID
    name: str
    contracted: int
    received: int
    pending: int
    costs_total: int
    labor_cost: int
    margin: int


class FinancialTotals(BaseModel):
    contracted: int
    received: int
    pending: int
    costs_total: int
    labor_cost: int
    margin: int


class FinancialReport(BaseModel):
    meta: ReportMeta
    totals: FinancialTotals
    by_project: list[FinancialProjectRow]
