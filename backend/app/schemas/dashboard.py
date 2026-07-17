"""Management dashboard (F2) response models — the `/dashboard` contract.

These mirror ``frontend/src/lib/api/dashboard-types.ts`` field-for-field so the
integration phase swaps the frontend mock for a real fetch with ZERO shape
changes. The wire format is camelCase (the TS contract); every model therefore
serializes by a camelCase alias. Money is integer EUR cents; enum/state values
are stable English keys; attention items carry i18n keys + params (never
pre-translated strings), localized in the view.

Role scoping (BR-002) and financial gating (BR-008) are applied in
``dashboard_service`` before serialization, exactly reproducing the mock's
``scopeDashboard`` behaviour: a Membro receives the scoped own-work payload, and
financial metrics/charts/attention groups are stripped for any caller without
the finance gate.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

MetricFormat = Literal["count", "currencyCents", "percent"]
MetricTone = Literal[
    "neutral", "gold", "success", "warning", "destructive", "info"
]
MetricKey = Literal[
    "openOpportunities",
    "pipelineValue",
    "activeProjects",
    "projectsAtRisk",
    "overdueTasks",
    "deliveriesNext7Days",
    "pendingPayments",
    "overduePayments",
    "teamLoad",
]

AttentionGroupKey = Literal[
    "overdueTasks",
    "projectsAtRisk",
    "opportunitiesNoNextAction",
    "proposalsAwaiting",
    "overloadedMembers",
    "overduePayments",
    "lowProgressNearDelivery",
    "blockedTasks",
]
AttentionSeverity = Literal["overdue", "atRisk", "due", "attention", "blocked"]
AttentionEntityType = Literal[
    "task", "project", "opportunity", "proposal", "member", "payment"
]
ProjectHealthState = Literal["healthy", "attention", "atRisk"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class DashboardMetric(_CamelModel):
    key: MetricKey
    value: int
    format: MetricFormat
    tone: MetricTone
    financial: bool
    href: str
    detail: int | None = None


class AttentionItem(_CamelModel):
    id: str
    entity_type: AttentionEntityType
    entity_id: str
    title: str
    meta_key: str
    meta_params: dict[str, str | int | float] | None = None
    severity: AttentionSeverity


class AttentionGroup(_CamelModel):
    key: AttentionGroupKey
    financial: bool
    items: list[AttentionItem]


class PipelinePoint(_CamelModel):
    month: str
    value_cents: int


class ProjectRef(_CamelModel):
    id: str
    name: str


class ProjectStatePoint(_CamelModel):
    state: ProjectHealthState
    count: int
    projects: list[ProjectRef]


class TaskFlowPoint(_CamelModel):
    week: str
    done: int
    overdue: int


class ContractedReceivedPoint(_CamelModel):
    month: str
    contracted_cents: int
    received_cents: int


class TeamLoadPoint(_CamelModel):
    member_id: str
    member_name: str
    allocation_pct: float


class DashboardCharts(_CamelModel):
    pipeline: list[PipelinePoint]
    projects_by_state: list[ProjectStatePoint]
    task_flow: list[TaskFlowPoint]
    contracted_received: list[ContractedReceivedPoint] | None
    team_load: list[TeamLoadPoint]


class DashboardData(_CamelModel):
    can_see_financials: bool
    scoped: bool
    metrics: list[DashboardMetric]
    attention: list[AttentionGroup]
    charts: DashboardCharts
