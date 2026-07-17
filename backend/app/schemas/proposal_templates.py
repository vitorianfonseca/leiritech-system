"""Schemas for proposal templates. Nested sections/items are replace-on-save:
providing a ``sections``/``items`` list replaces the whole collection. Money is
EUR cents; ``tax_rate`` is a percentage; ``totals`` is computed server-side.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.catalog import BillingType, CatalogUnit


class SectionInput(BaseModel):
    heading: str = Field(min_length=1, max_length=200)
    body: str = ""


class ItemInput(BaseModel):
    catalog_item_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    unit: CatalogUnit = "unit"
    unit_price: int = Field(ge=0)
    tax_rate: Decimal = Field(default=Decimal("23.00"), ge=0, le=100)
    billing_type: BillingType = "one_time"
    quantity: Decimal = Field(default=Decimal("1"), gt=0)


class ProposalTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    default_validity_days: int | None = Field(default=None, ge=0)
    default_discount_bps: int = Field(default=0, ge=0, le=10000)
    terms: str | None = None
    sections: list[SectionInput] = Field(default_factory=list)
    items: list[ItemInput] = Field(default_factory=list)


class ProposalTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    default_validity_days: int | None = Field(default=None, ge=0)
    default_discount_bps: int | None = Field(default=None, ge=0, le=10000)
    terms: str | None = None
    sections: list[SectionInput] | None = None
    items: list[ItemInput] | None = None


class SectionResponse(SectionInput):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    position: int


class ItemResponse(ItemInput):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    position: int


class GroupTotalResponse(BaseModel):
    net: int
    tax: int
    gross: int


class TotalsResponse(BaseModel):
    one_time: GroupTotalResponse
    monthly: GroupTotalResponse
    annual: GroupTotalResponse
    value: int


class ProposalTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    default_validity_days: int | None
    default_discount_bps: int
    terms: str | None
    sections: list[SectionResponse]
    items: list[ItemResponse]
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    totals: TotalsResponse | None = None
