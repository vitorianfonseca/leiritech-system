"""Report aggregation business logic (F19).

Builds the four report groups (commercial, projects, team, financial) as live
rollups and renders each as CSV for export. Reports own no data — every figure
is derived from the domain tables via ``repositories.reports``, and financial /
workload numbers reuse the authoritative domain services (``finance_service``,
``workload_service``) rather than recomputing margin or capacity here.

Access is enforced at the route layer (BR-002/BR-008): commercial and financial
are management/finance-gated; projects and team are scoped to a Membro's own
work. The ``scope_user_id`` passed in reflects that decision.
"""

from __future__ import annotations

from datetime import UTC, datetime

import structlog
from sqlalchemy.orm import Session

from app.core import csv_export
from app.core.permissions import Role
from app.models.user import User
from app.repositories import reports as repo
from app.schemas.reports import (
    CommercialReport,
    FinancialProjectRow,
    FinancialReport,
    FinancialTotals,
    PipelineStageRow,
    ProjectHealthCounts,
    ProjectsReport,
    ReportMeta,
    TeamMemberRow,
    TeamReport,
)
from app.services import finance_service, workload_service

logger = structlog.get_logger("leiritech.reports")


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _meta(user: User) -> ReportMeta:
    scope = "own" if user.role == Role.MEMBRO else "full"
    return ReportMeta(generated_at=_now(), scope=scope)


# --------------------------------------------------------------------------- #
# Commercial
# --------------------------------------------------------------------------- #
def build_commercial(db: Session, user: User) -> CommercialReport:
    counts = repo.opportunity_outcome_counts(db)
    open_value, weighted = repo.open_pipeline_value(db)
    decided = counts["won"] + counts["lost"]
    win_rate = round(counts["won"] / decided, 4) if decided else 0.0
    by_stage = [
        PipelineStageRow(
            stage_id=sid,
            stage=name,
            order_index=order_index,
            count=count,
            value=value,
        )
        for sid, name, order_index, count, value in repo.pipeline_by_stage(db)
    ]
    logger.info("report_commercial_built", actor_id=str(user.id))
    return CommercialReport(
        meta=_meta(user),
        open_count=counts["open"],
        won_count=counts["won"],
        lost_count=counts["lost"],
        total_count=counts["open"] + counts["won"] + counts["lost"],
        win_rate=win_rate,
        open_pipeline_value=open_value,
        weighted_pipeline_value=weighted,
        by_stage=by_stage,
    )


def commercial_csv(report: CommercialReport) -> str:
    rows: list[list[object]] = [
        ["open_opportunities", report.open_count, ""],
        ["won", report.won_count, ""],
        ["lost", report.lost_count, ""],
        ["win_rate", f"{report.win_rate:.4f}", ""],
        ["open_pipeline_value_cents", report.open_pipeline_value, ""],
        ["weighted_pipeline_value_cents", report.weighted_pipeline_value, ""],
    ]
    rows.extend(
        [f"stage:{s.stage}", s.count, s.value] for s in report.by_stage
    )
    return csv_export.render_csv(["metric", "count", "value_cents"], rows)


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
def build_projects(db: Session, user: User) -> ProjectsReport:
    scope_id = user.id if user.role == Role.MEMBRO else None
    status_counts = repo.project_status_counts(db, scope_id)
    health = repo.project_health_counts(db, scope_id)
    on_time, late = repo.completed_on_time(db, scope_id)
    decided = on_time + late
    on_time_rate = round(on_time / decided, 4) if decided else 0.0
    total = sum(status_counts.values())
    logger.info("report_projects_built", actor_id=str(user.id))
    return ProjectsReport(
        meta=_meta(user),
        total=total,
        active=status_counts.get("active", 0),
        completed=status_counts.get("completed", 0),
        on_hold=status_counts.get("on_hold", 0),
        at_risk=health.get("at_risk", 0),
        health=ProjectHealthCounts(
            healthy=health.get("healthy", 0),
            attention=health.get("attention", 0),
            at_risk=health.get("at_risk", 0),
            unset=health.get(None, 0),
        ),
        on_time_rate=on_time_rate,
        completed_on_time=on_time,
        completed_late=late,
    )


def projects_csv(report: ProjectsReport) -> str:
    rows: list[list[object]] = [
        ["total", report.total],
        ["active", report.active],
        ["completed", report.completed],
        ["on_hold", report.on_hold],
        ["at_risk", report.at_risk],
        ["health_healthy", report.health.healthy],
        ["health_attention", report.health.attention],
        ["health_at_risk", report.health.at_risk],
        ["health_unset", report.health.unset],
        ["completed_on_time", report.completed_on_time],
        ["completed_late", report.completed_late],
        ["on_time_rate", f"{report.on_time_rate:.4f}"],
    ]
    return csv_export.render_csv(["metric", "value"], rows)


# --------------------------------------------------------------------------- #
# Team
# --------------------------------------------------------------------------- #
def build_team(db: Session, user: User) -> TeamReport:
    workload = workload_service.team_workload(db, user)
    members = [
        TeamMemberRow(
            user_id=e.user_id,
            name=e.name,
            role=e.role,
            allocation_pct=e.allocation_pct,
            utilization_pct=e.utilization_pct,
            availability_state=e.availability_state,
            over_allocated=e.over_allocated,
        )
        for e in workload.items
    ]
    n = len(members)
    avg_alloc = round(sum(m.allocation_pct for m in members) / n, 1) if n else 0.0
    avg_util = round(sum(m.utilization_pct for m in members) / n, 1) if n else 0.0
    logger.info("report_team_built", actor_id=str(user.id))
    return TeamReport(
        meta=_meta(user),
        members=members,
        member_count=n,
        over_allocated_count=workload.over_allocated_count,
        avg_allocation_pct=avg_alloc,
        avg_utilization_pct=avg_util,
    )


def team_csv(report: TeamReport) -> str:
    header = [
        "user_id",
        "name",
        "role",
        "allocation_pct",
        "utilization_pct",
        "availability_state",
        "over_allocated",
    ]
    rows = [
        [
            str(m.user_id),
            m.name,
            m.role,
            m.allocation_pct,
            m.utilization_pct,
            m.availability_state,
            "yes" if m.over_allocated else "no",
        ]
        for m in report.members
    ]
    return csv_export.render_csv(header, rows)


# --------------------------------------------------------------------------- #
# Financial (BR-008 — gated at the route)
# --------------------------------------------------------------------------- #
def build_financial(db: Session, user: User) -> FinancialReport:
    by_project: list[FinancialProjectRow] = []
    totals = {"contracted": 0, "received": 0, "pending": 0, "costs": 0, "labor": 0, "margin": 0}
    for project in repo.non_archived_projects(db):
        summary = finance_service.financial_summary(db, project.id)
        by_project.append(
            FinancialProjectRow(
                project_id=project.id,
                name=project.name,
                contracted=summary.contracted,
                received=summary.received,
                pending=summary.pending,
                costs_total=summary.costs_total,
                labor_cost=summary.labor_cost,
                margin=summary.margin,
            )
        )
        totals["contracted"] += summary.contracted
        totals["received"] += summary.received
        totals["pending"] += summary.pending
        totals["costs"] += summary.costs_total
        totals["labor"] += summary.labor_cost
        totals["margin"] += summary.margin
    logger.info("report_financial_built", actor_id=str(user.id))
    return FinancialReport(
        meta=_meta(user),
        totals=FinancialTotals(
            contracted=totals["contracted"],
            received=totals["received"],
            pending=totals["pending"],
            costs_total=totals["costs"],
            labor_cost=totals["labor"],
            margin=totals["margin"],
        ),
        by_project=by_project,
    )


def financial_csv(report: FinancialReport) -> str:
    header = [
        "project_id",
        "project",
        "contracted_cents",
        "received_cents",
        "pending_cents",
        "costs_cents",
        "labor_cost_cents",
        "margin_cents",
    ]
    rows: list[list[object]] = [
        [
            str(p.project_id),
            p.name,
            p.contracted,
            p.received,
            p.pending,
            p.costs_total,
            p.labor_cost,
            p.margin,
        ]
        for p in report.by_project
    ]
    rows.append(
        [
            "",
            "TOTAL",
            report.totals.contracted,
            report.totals.received,
            report.totals.pending,
            report.totals.costs_total,
            report.totals.labor_cost,
            report.totals.margin,
        ]
    )
    return csv_export.render_csv(header, rows)
