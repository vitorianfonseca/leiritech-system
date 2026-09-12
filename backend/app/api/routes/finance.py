"""Financial ops routes (F14 — payment milestones, project costs, live margin).

INTERNAL tracking only (BR-070..073): no fiscal document, invoice number, or tax
field is ever produced. EVERY endpoint here is gated by ``RequireFinance`` — the
BR-008 financial-data gate (Admin, or Gestor with the payments grant; Membro
never). The state machine (§1.7), the create prerequisites (BR-071), the
cancelled/archived-project block (BR-037/BR-053) and the margin computation
(BR-065) live in ``finance_service``; these handlers only wire HTTP to it.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import RequireFinance
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.finance import (
    PaymentMilestoneCreate,
    PaymentMilestoneResponse,
    PaymentMilestoneStatus,
    PaymentMilestoneStatusChange,
    PaymentMilestoneUpdate,
    ProjectCostCreate,
    ProjectCostResponse,
    ProjectCostUpdate,
    ProjectFinancialSummary,
)
from app.services import finance_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


# --------------------------------------------------------------------------- #
# Payment milestones
# --------------------------------------------------------------------------- #
@router.get("/payment-milestones", response_model=Page[PaymentMilestoneResponse])
def list_payment_milestones(
    user: RequireFinance,
    db: DbSession,
    project_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    status_filter: Annotated[
        PaymentMilestoneStatus | None, Query(alias="status")
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[PaymentMilestoneResponse]:
    items, total = finance_service.list_milestones(
        db,
        project_id=project_id,
        company_id=company_id,
        status=status_filter,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[PaymentMilestoneResponse.model_validate(m) for m in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/payment-milestones",
    response_model=PaymentMilestoneResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_payment_milestone(
    payload: PaymentMilestoneCreate,
    user: RequireFinance,
    db: DbSession,
) -> PaymentMilestoneResponse:
    milestone = finance_service.create_milestone(db, user, payload)
    return PaymentMilestoneResponse.model_validate(milestone)


@router.get(
    "/payment-milestones/{milestone_id}",
    response_model=PaymentMilestoneResponse,
)
def get_payment_milestone(
    milestone_id: uuid.UUID,
    user: RequireFinance,
    db: DbSession,
) -> PaymentMilestoneResponse:
    milestone = finance_service.get_milestone(db, milestone_id)
    return PaymentMilestoneResponse.model_validate(milestone)


@router.patch(
    "/payment-milestones/{milestone_id}",
    response_model=PaymentMilestoneResponse,
)
def update_payment_milestone(
    milestone_id: uuid.UUID,
    payload: PaymentMilestoneUpdate,
    user: RequireFinance,
    db: DbSession,
) -> PaymentMilestoneResponse:
    milestone = finance_service.update_milestone(db, user, milestone_id, payload)
    return PaymentMilestoneResponse.model_validate(milestone)


@router.post(
    "/payment-milestones/{milestone_id}/status",
    response_model=PaymentMilestoneResponse,
)
def change_payment_milestone_status(
    milestone_id: uuid.UUID,
    payload: PaymentMilestoneStatusChange,
    user: RequireFinance,
    db: DbSession,
) -> PaymentMilestoneResponse:
    milestone = finance_service.change_milestone_status(
        db, user, milestone_id, payload
    )
    return PaymentMilestoneResponse.model_validate(milestone)


# --------------------------------------------------------------------------- #
# Project costs (BR-069 / H8)
# --------------------------------------------------------------------------- #
@router.get("/project-costs", response_model=Page[ProjectCostResponse])
def list_project_costs(
    user: RequireFinance,
    db: DbSession,
    # Optional: the finance overview needs every project's costs at once. With
    # this required, the client had to issue one request per project — four
    # projects meant four round trips, forty would mean forty.
    project_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[ProjectCostResponse]:
    items, total = finance_service.list_costs(
        db, project_id=project_id, page=page, page_size=page_size
    )
    return Page(
        items=[ProjectCostResponse.model_validate(c) for c in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/project-costs",
    response_model=ProjectCostResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project_cost(
    payload: ProjectCostCreate,
    user: RequireFinance,
    db: DbSession,
) -> ProjectCostResponse:
    cost = finance_service.create_cost(db, user, payload)
    return ProjectCostResponse.model_validate(cost)


@router.get("/project-costs/{cost_id}", response_model=ProjectCostResponse)
def get_project_cost(
    cost_id: uuid.UUID,
    user: RequireFinance,
    db: DbSession,
) -> ProjectCostResponse:
    cost = finance_service.get_cost(db, cost_id)
    return ProjectCostResponse.model_validate(cost)


@router.patch("/project-costs/{cost_id}", response_model=ProjectCostResponse)
def update_project_cost(
    cost_id: uuid.UUID,
    payload: ProjectCostUpdate,
    user: RequireFinance,
    db: DbSession,
) -> ProjectCostResponse:
    cost = finance_service.update_cost(db, user, cost_id, payload)
    return ProjectCostResponse.model_validate(cost)


@router.delete(
    "/project-costs/{cost_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_project_cost(
    cost_id: uuid.UUID,
    user: RequireFinance,
    db: DbSession,
) -> None:
    finance_service.delete_cost(db, user, cost_id)


# --------------------------------------------------------------------------- #
# Live margin + financial summary (BR-065)
# --------------------------------------------------------------------------- #
@router.get(
    "/projects/{project_id}/summary",
    response_model=ProjectFinancialSummary,
)
def get_project_financial_summary(
    project_id: uuid.UUID,
    user: RequireFinance,
    db: DbSession,
) -> ProjectFinancialSummary:
    return finance_service.financial_summary(db, project_id)
