"""Report routes (F19 — commercial / projects / team / financial + CSV export).

Each group exposes a JSON aggregate endpoint and a CSV export endpoint
(``.../export?format=csv``). Access is backend-authoritative (BR-001):

* commercial → Admin / Gestor (pipeline is Membro-invisible, BR-002).
* projects / team → any authenticated user; a Membro's rollup is scoped to
  their own work inside the service.
* financial → the BR-008 finance gate (``RequireFinance``): Admin, or Gestor
  with the payments grant; a Membro never reaches it.

CSV cells are hardened against formula injection (``core.csv_export``, issue #59
parity). Handlers stay thin: gate, delegate to ``report_service``, serialize.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireFinance, RequireGestor
from app.database.session import get_db
from app.schemas.reports import (
    CommercialReport,
    FinancialReport,
    ProjectsReport,
    TeamReport,
)
from app.services import report_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]
CsvFormat = Annotated[Literal["csv"], Query(description="Export format")]


def _csv_response(body: str, filename: str) -> Response:
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------------------------------------------------------------------- #
# Commercial (Admin / Gestor)
# --------------------------------------------------------------------------- #
@router.get("/commercial", response_model=CommercialReport)
def commercial_report(user: RequireGestor, db: DbSession) -> CommercialReport:
    return report_service.build_commercial(db, user)


@router.get("/commercial/export")
def commercial_export(
    user: RequireGestor, db: DbSession, format: CsvFormat = "csv"
) -> Response:
    report = report_service.build_commercial(db, user)
    return _csv_response(
        report_service.commercial_csv(report), "commercial-report.csv"
    )


# --------------------------------------------------------------------------- #
# Projects (all roles; Membro scoped)
# --------------------------------------------------------------------------- #
@router.get("/projects", response_model=ProjectsReport)
def projects_report(user: CurrentUser, db: DbSession) -> ProjectsReport:
    return report_service.build_projects(db, user)


@router.get("/projects/export")
def projects_export(
    user: CurrentUser, db: DbSession, format: CsvFormat = "csv"
) -> Response:
    report = report_service.build_projects(db, user)
    return _csv_response(report_service.projects_csv(report), "projects-report.csv")


# --------------------------------------------------------------------------- #
# Team (all roles; Membro scoped to own row)
# --------------------------------------------------------------------------- #
@router.get("/team", response_model=TeamReport)
def team_report(user: CurrentUser, db: DbSession) -> TeamReport:
    return report_service.build_team(db, user)


@router.get("/team/export")
def team_export(
    user: CurrentUser, db: DbSession, format: CsvFormat = "csv"
) -> Response:
    report = report_service.build_team(db, user)
    return _csv_response(report_service.team_csv(report), "team-report.csv")


# --------------------------------------------------------------------------- #
# Financial (BR-008 finance gate)
# --------------------------------------------------------------------------- #
@router.get("/financial", response_model=FinancialReport)
def financial_report(user: RequireFinance, db: DbSession) -> FinancialReport:
    return report_service.build_financial(db, user)


@router.get("/financial/export")
def financial_export(
    user: RequireFinance, db: DbSession, format: CsvFormat = "csv"
) -> Response:
    report = report_service.build_financial(db, user)
    return _csv_response(
        report_service.financial_csv(report), "financial-report.csv"
    )
