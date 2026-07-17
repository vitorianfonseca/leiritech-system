"""Pydantic v2 schemas for the product/service catalog. Money is EUR cents;
``tax_rate`` is a percentage. Status/enum literals mirror ``app.models.enums``
so invalid values are rejected with a 422 at the edge.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CatalogUnit = Literal["unit", "hour", "day", "month", "m2", "license", "fixed"]
BillingType = Literal["one_time", "monthly", "annual"]


class CatalogItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    unit: CatalogUnit = "unit"
    unit_price: int = Field(ge=0)  # EUR cents
    tax_rate: Decimal = Field(default=Decimal("23.00"), ge=0, le=100)
    billing_type: BillingType = "one_time"


class CatalogItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    unit: CatalogUnit | None = None
    unit_price: int | None = Field(default=None, ge=0)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100)
    billing_type: BillingType | None = None


class CatalogItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    category: str | None
    unit: str
    unit_price: int
    tax_rate: Decimal
    billing_type: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
