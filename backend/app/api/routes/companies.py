"""Company routes (CRM F4).

View is available to any authenticated user (scoped for a Membro, BR-002);
create/edit/archive/restore require Gestor+ (matrix §3). Business rules live in
``company_service`` — these handlers only wire HTTP to the service.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.crm import (
    CompanyCreate,
    CompanyResponse,
    CompanyStatus,
    CompanyUpdate,
)
from app.services import company_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[CompanyResponse])
def list_companies(
    user: CurrentUser,
    db: DbSession,
    status_filter: Annotated[CompanyStatus | None, Query(alias="status")] = None,
    sector: Annotated[str | None, Query(max_length=128)] = None,
    owner_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    include_archived: bool = False,
    sort: Annotated[str, Query(pattern="^-?(name|created_at)$")] = "-created_at",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[CompanyResponse]:
    companies, total = company_service.list_companies(
        db,
        user,
        status=status_filter,
        sector=sector,
        owner_id=owner_id,
        q=q,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[CompanyResponse.model_validate(c) for c in companies],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate,
    user: RequireGestor,
    db: DbSession,
) -> CompanyResponse:
    company = company_service.create_company(db, user, payload)
    return CompanyResponse.model_validate(company)


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(
    company_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> CompanyResponse:
    company = company_service.get_company_or_404(db, user, company_id)
    return CompanyResponse.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: uuid.UUID,
    payload: CompanyUpdate,
    user: RequireGestor,
    db: DbSession,
) -> CompanyResponse:
    company = company_service.update_company(db, user, company_id, payload)
    return CompanyResponse.model_validate(company)


@router.post("/{company_id}/archive", response_model=CompanyResponse)
def archive_company(
    company_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> CompanyResponse:
    company = company_service.archive_company(db, user, company_id)
    return CompanyResponse.model_validate(company)


@router.post("/{company_id}/restore", response_model=CompanyResponse)
def restore_company(
    company_id: uuid.UUID,
    user: RequireGestor,
    db: DbSession,
) -> CompanyResponse:
    company = company_service.restore_company(db, user, company_id)
    return CompanyResponse.model_validate(company)
