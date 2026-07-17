"""Tests for reports aggregates + CSV export (F19, BR-002/BR-008).

Covers: the CSV formula-injection guard (issue #59 parity) as a pure unit and
end-to-end through the financial export; aggregate correctness via before/after
deltas (robust against pre-existing seed data); the commercial (Admin/Gestor)
and financial (BR-008 finance) access gates; and CSV content-type/headers. Runs
against the real Postgres (:5433).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core import csv_export
from app.database.session import SessionLocal
from app.models.crm import Opportunity
from app.models.project import Project
from app.services import report_service

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def track() -> Iterator[dict[str, list[uuid.UUID]]]:
    ids: dict[str, list[uuid.UUID]] = {"project": [], "opportunity": []}
    yield ids
    db = SessionLocal()
    try:
        if ids["opportunity"]:
            db.execute(delete(Opportunity).where(Opportunity.id.in_(ids["opportunity"])))
        if ids["project"]:
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        db.commit()
    finally:
        db.close()


def _make_opportunity(track: dict, *, outcome: str, value: int) -> Opportunity:
    db = SessionLocal()
    try:
        opp = Opportunity(
            title=f"OPP {uuid.uuid4().hex[:8]}",
            outcome=outcome,
            estimated_value=value,
            probability=50,
        )
        db.add(opp)
        db.commit()
        db.refresh(opp)
        track["opportunity"].append(opp.id)
        db.expunge(opp)
        return opp
    finally:
        db.close()


def _make_project(track: dict, *, name: str, health: str | None = None) -> Project:
    db = SessionLocal()
    try:
        project = Project(name=name, status="active", published_health=health)
        db.add(project)
        db.commit()
        db.refresh(project)
        track["project"].append(project.id)
        db.expunge(project)
        return project
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# CSV formula-injection guard — pure unit (issue #59 parity)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("payload", ["=SUM(A1)", "+1+1", "-2", "@cmd", "\tx", "\rx"])
def test_csv_guards_formula_triggers(payload: str) -> None:
    # The neutralizing single-quote is prepended; a cell that additionally needs
    # RFC-4180 wrapping (e.g. one containing CR) carries the quote just inside
    # the wrapping double-quote — in both cases the leading char is no longer a
    # formula trigger.
    assert csv_export.escape_cell(payload).lstrip('"').startswith("'")


def test_csv_leaves_normal_and_accented_cells_untouched() -> None:
    assert csv_export.escape_cell("Rebranding") == "Rebranding"
    assert csv_export.escape_cell("Ação — Solução") == "Ação — Solução"
    assert csv_export.escape_cell(1200) == "1200"
    assert csv_export.escape_cell(None) == ""


def test_csv_rfc4180_quoting() -> None:
    assert csv_export.escape_cell("a;b") == '"a;b"'
    assert csv_export.escape_cell('a"b') == '"a""b"'
    assert csv_export.escape_cell("line\nbreak") == '"line\nbreak"'


def test_render_csv_has_bom_and_crlf() -> None:
    out = csv_export.render_csv(["h1", "h2"], [["a", "b"]])
    assert out.startswith("﻿")
    assert "h1;h2\r\n" in out
    assert out.endswith("\r\n")


# --------------------------------------------------------------------------- #
# Aggregate correctness (before/after deltas)
# --------------------------------------------------------------------------- #
def test_commercial_counts_reflect_new_opportunities(
    client, make_user, track
) -> None:
    admin = make_user(role="admin")
    db = SessionLocal()
    try:
        admin_obj = db.get(type(admin), admin.id)
        before = report_service.build_commercial(db, admin_obj)
    finally:
        db.close()

    _make_opportunity(track, outcome="won", value=100_00)
    _make_opportunity(track, outcome="lost", value=50_00)
    _make_opportunity(track, outcome="open", value=200_00)

    db = SessionLocal()
    try:
        admin_obj = db.get(type(admin), admin.id)
        after = report_service.build_commercial(db, admin_obj)
    finally:
        db.close()

    assert after.won_count == before.won_count + 1
    assert after.lost_count == before.lost_count + 1
    assert after.open_count == before.open_count + 1
    assert after.open_pipeline_value == before.open_pipeline_value + 200_00
    assert 0.0 <= after.win_rate <= 1.0


def test_projects_health_counts_reflect_new_at_risk_project(
    client, make_user, track
) -> None:
    admin = make_user(role="admin")
    db = SessionLocal()
    try:
        admin_obj = db.get(type(admin), admin.id)
        before = report_service.build_projects(db, admin_obj).health.at_risk
    finally:
        db.close()

    _make_project(track, name=f"AtRisk {uuid.uuid4().hex[:6]}", health="at_risk")

    db = SessionLocal()
    try:
        admin_obj = db.get(type(admin), admin.id)
        after = report_service.build_projects(db, admin_obj).health.at_risk
    finally:
        db.close()

    assert after == before + 1


# --------------------------------------------------------------------------- #
# CSV export end-to-end + injection through a real project name
# --------------------------------------------------------------------------- #
def test_financial_export_neutralizes_injection_in_project_name(
    client, make_user, track
) -> None:
    admin = make_user(role="admin")
    _make_project(track, name="=IMPORTDATA()")

    resp = client.get(
        f"{API}/reports/financial/export?format=csv",
        headers=_auth(_token(client, admin.email)),
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "text/csv; charset=utf-8"
    assert "attachment; filename=" in resp.headers["content-disposition"]
    # The dangerous name is present but neutralised with a leading quote.
    assert "'=IMPORTDATA()" in resp.text
    assert ";=IMPORTDATA()" not in resp.text


def test_commercial_export_is_csv(client, make_user) -> None:
    admin = make_user(role="admin")
    resp = client.get(
        f"{API}/reports/commercial/export?format=csv",
        headers=_auth(_token(client, admin.email)),
    )
    assert resp.status_code == 200
    assert resp.text.startswith("﻿")
    assert "win_rate" in resp.text


# --------------------------------------------------------------------------- #
# Access gates (BR-002 commercial, BR-008 financial)
# --------------------------------------------------------------------------- #
def test_commercial_report_requires_gestor(client, make_user) -> None:
    membro = make_user(role="membro")
    resp = client.get(
        f"{API}/reports/commercial", headers=_auth(_token(client, membro.email))
    )
    assert resp.status_code == 403


def test_financial_report_finance_gate(client, make_user) -> None:
    membro = make_user(role="membro")
    gestor_plain = make_user(role="gestor", payments_grant=False)
    gestor_grant = make_user(role="gestor", payments_grant=True)
    admin = make_user(role="admin")

    def status(email: str) -> int:
        return client.get(
            f"{API}/reports/financial", headers=_auth(_token(client, email))
        ).status_code

    assert status(membro.email) == 403
    assert status(gestor_plain.email) == 403
    assert status(gestor_grant.email) == 200
    assert status(admin.email) == 200


def test_financial_export_finance_gate(client, make_user) -> None:
    gestor_plain = make_user(role="gestor", payments_grant=False)
    admin = make_user(role="admin")
    assert (
        client.get(
            f"{API}/reports/financial/export?format=csv",
            headers=_auth(_token(client, gestor_plain.email)),
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"{API}/reports/financial/export?format=csv",
            headers=_auth(_token(client, admin.email)),
        ).status_code
        == 200
    )


def test_reports_require_auth(client) -> None:
    for path in ("commercial", "projects", "team", "financial"):
        assert client.get(f"{API}/reports/{path}").status_code == 401
