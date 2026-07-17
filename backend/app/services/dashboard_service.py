"""Management dashboard aggregation (F2) — the `/dashboard` payload.

Produces the exact ``DashboardData`` contract the frontend consumes
(``frontend/src/lib/api/dashboard-types.ts``), reproducing the mock's role
scoping (BR-002) and financial gating (BR-008):

* Admin / Gestor           → full payload (all metrics, attention, charts).
* Gestor without the grant  → full payload MINUS financial metrics / the
  overdue-payments attention group / the contracted-vs-received chart.
* Membro                    → scoped own-work payload (own projects/tasks only,
  no financial or team-wide surfaces).

Every number is derived live from ``repositories.reports``; margin/pending come
from the finance rollups and team load reuses ``workload_service`` — nothing is
recomputed from scratch and nothing is cached. Attention items carry i18n keys +
params, never pre-translated strings (localized in the view).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import structlog
from sqlalchemy.orm import Session

from app.core import permissions
from app.core.permissions import Role
from app.models.user import User
from app.repositories import my_work as my_work_repo
from app.repositories import reports as repo
from app.schemas.dashboard import (
    AttentionGroup,
    AttentionItem,
    ContractedReceivedPoint,
    DashboardCharts,
    DashboardData,
    DashboardMetric,
    PipelinePoint,
    ProjectRef,
    ProjectStatePoint,
    TaskFlowPoint,
    TeamLoadPoint,
)
from app.services import workload_service

logger = structlog.get_logger("aurea.dashboard")

_MONTH_KEYS = (
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
)
# Frontend health zone key is camelCase; the DB persists snake_case.
_HEALTH_TO_STATE = {"healthy": "healthy", "attention": "attention", "at_risk": "atRisk"}


def _today() -> date:
    return datetime.now(tz=UTC).date()


def _last_months(today: date, n: int) -> list[tuple[int, int]]:
    """``n`` (year, month) tuples, oldest → newest, ending on ``today``'s month."""
    out: list[tuple[int, int]] = []
    year, month = today.year, today.month
    for _ in range(n):
        out.append((year, month))
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(out))


def _week_windows(today: date, n: int) -> list[tuple[date, date]]:
    """``n`` [monday, next_monday) windows, oldest → newest, ending this week."""
    monday = today - timedelta(days=today.weekday())
    windows: list[tuple[date, date]] = []
    for i in range(n):
        start = monday - timedelta(days=(n - 1 - i) * 7)
        windows.append((start, start + timedelta(days=7)))
    return windows


def _format_eur(cents: int) -> str:
    """`620000` → `"6.200 €"` (dot thousands, whole euros) for attention params."""
    euros = round(cents / 100)
    return f"{euros:,.0f} €".replace(",", ".")


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def _full_metrics(db: Session, today: date) -> list[DashboardMetric]:
    outcomes = repo.opportunity_outcome_counts(db)
    open_value, _weighted = repo.open_pipeline_value(db)
    status_counts = repo.project_status_counts(db, None)
    health = repo.project_health_counts(db, None)
    overdue_tasks = repo.overdue_task_count(db, today, None)
    deliveries = repo.deliveries_within(db, today, today + timedelta(days=7), None)
    pending = repo.pending_total(db)
    overdue_pay = repo.overdue_total(db)
    team = _team_stats(db)

    m = DashboardMetric
    return [
        m(key="openOpportunities", value=outcomes["open"], format="count",
          tone="gold", financial=False, href="/crm/pipeline"),
        m(key="pipelineValue", value=open_value, format="currencyCents",
          tone="gold", financial=False, href="/crm/pipeline"),
        m(key="activeProjects", value=status_counts.get("active", 0),
          format="count", tone="neutral", financial=False, href="/projects"),
        m(key="projectsAtRisk", value=health.get("at_risk", 0), format="count",
          tone="destructive", financial=False, href="/projects"),
        m(key="overdueTasks", value=overdue_tasks, format="count",
          tone="destructive", financial=False, href="/tasks"),
        m(key="deliveriesNext7Days", value=deliveries, format="count",
          tone="warning", financial=False, href="/calendar"),
        m(key="pendingPayments", value=pending, format="currencyCents",
          tone="warning", financial=True, href="/finance"),
        m(key="overduePayments", value=overdue_pay, format="currencyCents",
          tone="destructive", financial=True, href="/finance"),
        m(key="teamLoad", value=team["avg_pct"], format="percent", tone="info",
          financial=False, href="/team", detail=team["over"]),
    ]


def _scoped_metrics(db: Session, user: User, today: date) -> list[DashboardMetric]:
    status_counts = repo.project_status_counts(db, user.id)
    active = sum(
        status_counts.get(s, 0) for s in ("planning", "active", "on_hold")
    )
    overdue_tasks = repo.overdue_task_count(db, today, user.id)
    deliveries = repo.deliveries_within(db, today, today + timedelta(days=7), user.id)
    m = DashboardMetric
    return [
        m(key="activeProjects", value=active, format="count", tone="neutral",
          financial=False, href="/my-work"),
        m(key="overdueTasks", value=overdue_tasks, format="count",
          tone="destructive", financial=False, href="/my-work"),
        m(key="deliveriesNext7Days", value=deliveries, format="count",
          tone="warning", financial=False, href="/calendar"),
    ]


def _team_stats(db: Session) -> dict[str, int]:
    # Only runs for the full (management) payload → the rollup is the whole team.
    entries = _all_team_entries(db)
    n = len(entries)
    avg = round(sum(e.allocation_pct for e in entries) / n) if n else 0
    over = sum(1 for e in entries if e.over_allocated)
    return {"avg_pct": int(avg), "over": over, "count": n}


# --------------------------------------------------------------------------- #
# Attention groups
# --------------------------------------------------------------------------- #
def _full_attention(db: Session, today: date) -> list[AttentionGroup]:
    groups: list[AttentionGroup] = []

    overdue_items = [
        AttentionItem(
            id=f"task-{t.id}",
            entity_type="task",
            entity_id=str(t.id),
            title=t.title,
            meta_key="overdueTask",
            meta_params={
                "project": project_name or "",
                "days": (today - t.due_date).days,
            },
            severity="overdue",
        )
        for t, project_name in repo.overdue_tasks(db, today, None)
    ]
    groups.append(AttentionGroup(key="overdueTasks", financial=False, items=overdue_items))

    blocked_items = [
        AttentionItem(
            id=f"task-{t.id}",
            entity_type="task",
            entity_id=str(t.id),
            title=t.title,
            meta_key="blockedTask",
            meta_params={"reason": t.block_reason or ""},
            severity="blocked",
        )
        for t in repo.blocked_tasks(db, None)
    ]
    groups.append(AttentionGroup(key="blockedTasks", financial=False, items=blocked_items))

    at_risk_projects = repo.projects_at_risk(db, None)
    at_risk_progress = my_work_repo.avg_phase_progress(
        db, [p.id for p in at_risk_projects]
    )
    at_risk_items = [
        AttentionItem(
            id=f"project-{p.id}",
            entity_type="project",
            entity_id=str(p.id),
            title=p.name,
            meta_key="projectAtRisk",
            meta_params={"progress": at_risk_progress.get(p.id, 0)},
            severity="atRisk",
        )
        for p in at_risk_projects
    ]
    groups.append(AttentionGroup(key="projectsAtRisk", financial=False, items=at_risk_items))

    end7 = today + timedelta(days=7)
    near_delivery_projects = repo.low_progress_near_delivery(db, today, end7, None)
    near_delivery_progress = my_work_repo.avg_phase_progress(
        db, [p.id for p in near_delivery_projects]
    )
    low_progress_items = [
        AttentionItem(
            id=f"project-{p.id}",
            entity_type="project",
            entity_id=str(p.id),
            title=p.name,
            meta_key="lowProgressNearDelivery",
            meta_params={
                "days": (p.deadline - today).days,
                "progress": near_delivery_progress.get(p.id, 0),
            },
            severity="due",
        )
        for p in near_delivery_projects
    ]
    groups.append(
        AttentionGroup(key="lowProgressNearDelivery", financial=False, items=low_progress_items)
    )

    no_action_items = [
        AttentionItem(
            id=f"opportunity-{o.id}",
            entity_type="opportunity",
            entity_id=str(o.id),
            title=o.title,
            meta_key="opportunityNoNextAction",
            severity="attention",
        )
        for o in repo.opportunities_no_next_action(db, today)
    ]
    groups.append(
        AttentionGroup(key="opportunitiesNoNextAction", financial=False, items=no_action_items)
    )

    proposal_items = [
        AttentionItem(
            id=f"proposal-{p.id}",
            entity_type="proposal",
            entity_id=str(p.id),
            title=p.reference,
            meta_key="proposalExpiring",
            meta_params=(
                {"days": (p.valid_until - today).days}
                if p.valid_until is not None
                else None
            ),
            severity="due",
        )
        for p in repo.proposals_awaiting(db)
    ]
    groups.append(AttentionGroup(key="proposalsAwaiting", financial=False, items=proposal_items))

    overloaded_items = [
        AttentionItem(
            id=f"member-{e.user_id}",
            entity_type="member",
            entity_id=str(e.user_id),
            title=e.name,
            meta_key="overloadedMember",
            meta_params={"alloc": e.allocation_pct},
            severity="attention",
        )
        for e in _overloaded_members(db)
    ]
    groups.append(AttentionGroup(key="overloadedMembers", financial=False, items=overloaded_items))

    payment_items = [
        AttentionItem(
            id=f"payment-{m.id}",
            entity_type="payment",
            entity_id=str(m.id),
            title=project_name or "",
            meta_key="overduePayment",
            meta_params={
                "amount": _format_eur(m.amount - m.received_amount),
                "days": (today - expected).days if expected else 0,
            },
            severity="overdue",
        )
        for m, project_name, expected in repo.overdue_milestones(db)
    ]
    groups.append(AttentionGroup(key="overduePayments", financial=True, items=payment_items))

    return groups


def _scoped_attention(db: Session, user: User, today: date) -> list[AttentionGroup]:
    overdue_items = [
        AttentionItem(
            id=f"task-{t.id}",
            entity_type="task",
            entity_id=str(t.id),
            title=t.title,
            meta_key="overdueTask",
            meta_params={
                "project": project_name or "",
                "days": (today - t.due_date).days,
            },
            severity="overdue",
        )
        for t, project_name in repo.overdue_tasks(db, today, user.id)
    ]
    blocked_items = [
        AttentionItem(
            id=f"task-{t.id}",
            entity_type="task",
            entity_id=str(t.id),
            title=t.title,
            meta_key="blockedTask",
            meta_params={"reason": t.block_reason or ""},
            severity="blocked",
        )
        for t in repo.blocked_tasks(db, user.id)
    ]
    return [
        AttentionGroup(key="overdueTasks", financial=False, items=overdue_items),
        AttentionGroup(key="blockedTasks", financial=False, items=blocked_items),
    ]


def _overloaded_members(db: Session):
    return [e for e in _all_team_entries(db) if e.over_allocated]


# --------------------------------------------------------------------------- #
# Charts
# --------------------------------------------------------------------------- #
def _full_charts(db: Session, today: date, can_finance: bool) -> DashboardCharts:
    months = _last_months(today, 6)
    pipeline_by_month = repo.pipeline_value_by_month(db, months)
    pipeline = [
        PipelinePoint(month=_MONTH_KEYS[m - 1], value_cents=pipeline_by_month[(y, m)])
        for (y, m) in months
    ]

    grouped = repo.projects_by_effective_health(db, None)
    projects_by_state: list[ProjectStatePoint] = []
    for health in ("healthy", "attention", "at_risk"):
        items = grouped.get(health, [])
        projects_by_state.append(
            ProjectStatePoint(
                state=_HEALTH_TO_STATE[health],
                count=len(items),
                projects=[ProjectRef(id=str(pid), name=name) for pid, name in items],
            )
        )

    task_flow = _task_flow(db, today, None)

    contracted_received = None
    if can_finance:
        contracted = repo.contracted_by_month(db, months)
        received = repo.received_by_month(db, months)
        contracted_received = [
            ContractedReceivedPoint(
                month=_MONTH_KEYS[m - 1],
                contracted_cents=contracted[(y, m)],
                received_cents=received[(y, m)],
            )
            for (y, m) in months
        ]

    team_load = [
        TeamLoadPoint(
            member_id=str(e.user_id),
            member_name=e.name,
            allocation_pct=e.allocation_pct,
        )
        for e in _all_team_entries(db)
    ]

    return DashboardCharts(
        pipeline=pipeline,
        projects_by_state=projects_by_state,
        task_flow=task_flow,
        contracted_received=contracted_received,
        team_load=team_load,
    )


def _scoped_charts(db: Session, user: User, today: date) -> DashboardCharts:
    return DashboardCharts(
        pipeline=[],
        projects_by_state=[],
        task_flow=_task_flow(db, today, user.id),
        contracted_received=None,
        team_load=[],
    )


def _task_flow(db: Session, today: date, scope_id) -> list[TaskFlowPoint]:
    points: list[TaskFlowPoint] = []
    for idx, (start, end) in enumerate(_week_windows(today, 6), start=1):
        done, overdue = repo.task_flow_between(db, start, end, scope_id)
        points.append(TaskFlowPoint(week=f"w{idx}", done=done, overdue=overdue))
    return points


def _all_team_entries(db: Session):
    from app.repositories import workload as workload_repo

    users = workload_repo.active_users(db)
    allocated = workload_repo.allocated_hours_by_user(db)
    return [
        workload_service.compute_entry(u, allocated.get(u.id, 0.0), 0.0)
        for u in users
    ]


# --------------------------------------------------------------------------- #
# Public entrypoint
# --------------------------------------------------------------------------- #
def get_dashboard(db: Session, user: User) -> DashboardData:
    """Assemble the role-scoped, finance-gated dashboard payload (F2)."""
    today = _today()
    can_finance = permissions.can_manage_financials(user)
    scoped = user.role == Role.MEMBRO

    if scoped:
        logger.info("dashboard_built", actor_id=str(user.id), scope="own")
        return DashboardData(
            can_see_financials=False,
            scoped=True,
            metrics=_scoped_metrics(db, user, today),
            attention=[
                g for g in _scoped_attention(db, user, today) if g.items
            ],
            charts=_scoped_charts(db, user, today),
        )

    metrics = [
        m for m in _full_metrics(db, today) if can_finance or not m.financial
    ]
    attention = [
        g
        for g in _full_attention(db, today)
        if (can_finance or not g.financial) and g.items
    ]
    logger.info(
        "dashboard_built",
        actor_id=str(user.id),
        scope="full",
        finance=can_finance,
    )
    return DashboardData(
        can_see_financials=can_finance,
        scoped=False,
        metrics=metrics,
        attention=attention,
        charts=_full_charts(db, today, can_finance),
    )
