"""Tests for the management dashboard (F2, BR-002/BR-008).

Covers the exact ``DashboardData`` contract shape, the Admin/Gestor full payload
vs the Membro scoped own-work payload, the BR-008 financial gate (financial
metrics / charts / attention stripped for a Gestor without the payments grant
and for a Membro), and that the projectsByState chart carries the per-health
projects[] breakdown. Runs against the real Postgres (:5433).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.project import Project
from app.models.task import Task

API = "/api/v1"
PASSWORD = "correct-horse-battery"

_SCOPED_METRIC_KEYS = {"activeProjects", "overdueTasks", "deliveriesNext7Days"}
_FINANCIAL_METRIC_KEYS = {"pendingPayments", "overduePayments"}


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _dashboard(client: TestClient, email: str) -> dict:
    resp = client.get(f"{API}/dashboard", headers=_auth(_token(client, email)))
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture
def track() -> Iterator[dict[str, list[uuid.UUID]]]:
    ids: dict[str, list[uuid.UUID]] = {"project": []}
    yield ids
    db = SessionLocal()
    try:
        if ids["project"]:
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        db.commit()
    finally:
        db.close()


def _make_project(
    track: dict,
    *,
    name: str,
    manager_id: uuid.UUID | None = None,
    health: str | None = None,
) -> Project:
    db = SessionLocal()
    try:
        project = Project(
            name=name, status="active", manager_id=manager_id, published_health=health
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        track["project"].append(project.id)
        db.expunge(project)
        return project
    finally:
        db.close()


def _make_phase(project_id: uuid.UUID, *, progress: int) -> None:
    from app.models.project import ProjectPhase

    db = SessionLocal()
    try:
        db.add(
            ProjectPhase(
                project_id=project_id,
                name="Phase",
                order_index=0,
                progress=progress,
            )
        )
        db.commit()
    finally:
        db.close()


def _make_overdue_task(project_id: uuid.UUID, assignee_id: uuid.UUID) -> uuid.UUID:
    db = SessionLocal()
    try:
        task = Task(
            project_id=project_id,
            title="Overdue smoke task",
            status="todo",
            primary_assignee_id=assignee_id,
            due_date=date.today() - timedelta(days=3),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        tid = task.id
        return tid
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Contract shape
# --------------------------------------------------------------------------- #
def test_dashboard_shape_and_keys(client, make_user) -> None:
    admin = make_user(role="admin")
    data = _dashboard(client, admin.email)

    assert set(data.keys()) == {
        "canSeeFinancials",
        "scoped",
        "metrics",
        "attention",
        "charts",
    }
    assert set(data["charts"].keys()) == {
        "pipeline",
        "projectsByState",
        "taskFlow",
        "contractedReceived",
        "teamLoad",
    }
    # taskFlow is always the 6-week window with camelCase point fields.
    assert len(data["charts"]["taskFlow"]) == 6
    assert set(data["charts"]["taskFlow"][0].keys()) == {"week", "done", "overdue"}
    for metric in data["metrics"]:
        assert set(metric.keys()) >= {
            "key",
            "value",
            "format",
            "tone",
            "financial",
            "href",
        }


# --------------------------------------------------------------------------- #
# Role scoping (BR-002)
# --------------------------------------------------------------------------- #
def test_admin_gets_full_payload(client, make_user) -> None:
    admin = make_user(role="admin")
    data = _dashboard(client, admin.email)
    assert data["scoped"] is False
    assert data["canSeeFinancials"] is True
    keys = {m["key"] for m in data["metrics"]}
    # Overview KPIs are the 6 non-financial decision drivers. Payments and team
    # load were moved off the dashboard (they live on /finance and /team); the
    # financial gate now shows through the charts + attention groups, not tiles.
    assert keys == {
        "openOpportunities", "pipelineValue", "activeProjects",
        "projectsAtRisk", "overdueTasks", "deliveriesNext7Days",
    }
    assert not (keys & _FINANCIAL_METRIC_KEYS)
    assert data["charts"]["contractedReceived"] is not None


def test_membro_gets_scoped_payload(client, make_user) -> None:
    membro = make_user(role="membro")
    data = _dashboard(client, membro.email)

    assert data["scoped"] is True
    assert data["canSeeFinancials"] is False
    keys = {m["key"] for m in data["metrics"]}
    assert keys <= _SCOPED_METRIC_KEYS
    assert not (keys & _FINANCIAL_METRIC_KEYS)

    charts = data["charts"]
    assert charts["pipeline"] == []
    assert charts["projectsByState"] == []
    assert charts["teamLoad"] == []
    assert charts["contractedReceived"] is None
    assert len(charts["taskFlow"]) == 6

    attention_keys = {g["key"] for g in data["attention"]}
    assert attention_keys <= {"overdueTasks", "blockedTasks"}


def test_membro_scoped_overdue_task_surfaces(client, make_user, track) -> None:
    membro = make_user(role="membro")
    project = _make_project(
        track, name=f"Scoped {uuid.uuid4().hex[:6]}", manager_id=membro.id
    )
    task_id = _make_overdue_task(project.id, membro.id)

    data = _dashboard(client, membro.email)
    overdue_metric = next(
        m for m in data["metrics"] if m["key"] == "overdueTasks"
    )
    assert overdue_metric["value"] >= 1

    overdue_group = next(
        g for g in data["attention"] if g["key"] == "overdueTasks"
    )
    entity_ids = {item["entityId"] for item in overdue_group["items"]}
    assert str(task_id) in entity_ids


# --------------------------------------------------------------------------- #
# Financial gate (BR-008)
# --------------------------------------------------------------------------- #
def test_gestor_without_grant_has_no_financials(client, make_user) -> None:
    gestor = make_user(role="gestor", payments_grant=False)
    data = _dashboard(client, gestor.email)

    assert data["scoped"] is False
    assert data["canSeeFinancials"] is False
    keys = {m["key"] for m in data["metrics"]}
    assert not (keys & _FINANCIAL_METRIC_KEYS)
    # Non-financial commercial metric stays visible to a Gestor.
    assert "pipelineValue" in keys
    assert data["charts"]["contractedReceived"] is None
    assert "overduePayments" not in {g["key"] for g in data["attention"]}


def test_gestor_with_grant_sees_financials(client, make_user) -> None:
    gestor = make_user(role="gestor", payments_grant=True)
    data = _dashboard(client, gestor.email)

    assert data["canSeeFinancials"] is True
    keys = {m["key"] for m in data["metrics"]}
    # Payments are not on the overview tiles; the finance gate shows via charts.
    assert not (keys & _FINANCIAL_METRIC_KEYS)
    assert data["charts"]["contractedReceived"] is not None


# --------------------------------------------------------------------------- #
# projectsByState per-health breakdown (frontend contract requirement)
# --------------------------------------------------------------------------- #
def test_projects_by_state_includes_project_breakdown(
    client, make_user, track
) -> None:
    admin = make_user(role="admin")
    project = _make_project(
        track, name=f"Risky {uuid.uuid4().hex[:6]}", health="at_risk"
    )

    data = _dashboard(client, admin.email)
    at_risk_point = next(
        p for p in data["charts"]["projectsByState"] if p["state"] == "atRisk"
    )
    ids = {ref["id"] for ref in at_risk_point["projects"]}
    assert str(project.id) in ids
    assert at_risk_point["count"] == len(at_risk_point["projects"])


def test_project_at_risk_attention_carries_progress_param(
    client, make_user, track
) -> None:
    """Regression: the projectAtRisk attention item must carry a `progress`
    metaParam (derived from avg phase progress) so the frontend i18n template
    `{progress}% progress` renders instead of a raw key."""
    admin = make_user(role="admin")
    project = _make_project(
        track, name=f"Risky {uuid.uuid4().hex[:6]}", health="at_risk"
    )
    _make_phase(project.id, progress=40)

    data = _dashboard(client, admin.email)
    group = next(g for g in data["attention"] if g["key"] == "projectsAtRisk")
    item = next(i for i in group["items"] if i["entityId"] == str(project.id))
    assert item["metaParams"] is not None
    assert item["metaParams"]["progress"] == 40


def test_low_progress_near_delivery_attention_carries_progress_param(
    client, make_user, track
) -> None:
    """Regression: lowProgressNearDelivery items must carry both `days` and
    `progress` metaParams (the i18n template needs both)."""
    admin = make_user(role="admin")
    project = _make_project(track, name=f"NearDue {uuid.uuid4().hex[:6]}")
    # Give it a near deadline so it lands in the low-progress-near-delivery group.
    db = SessionLocal()
    try:
        p = db.get(Project, project.id)
        p.deadline = date.today() + timedelta(days=3)
        db.commit()
    finally:
        db.close()
    _make_phase(project.id, progress=15)

    data = _dashboard(client, admin.email)
    group = next(
        g for g in data["attention"] if g["key"] == "lowProgressNearDelivery"
    )
    item = next(i for i in group["items"] if i["entityId"] == str(project.id))
    assert item["metaParams"] is not None
    assert set(item["metaParams"].keys()) >= {"days", "progress"}
    assert item["metaParams"]["progress"] == 15


def test_dashboard_requires_auth(client) -> None:
    assert client.get(f"{API}/dashboard").status_code == 401
