"""Pydantic v2 request/response schemas for the CRM domain.

Status/type literals mirror ``app.models.enums`` (the persisted English keys);
they are duplicated here as ``Literal`` types so invalid values are rejected with
a 422 at the edge before reaching the service layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

CompanyStatus = Literal["potential", "active", "inactive", "partner"]
ContactStatus = Literal["active", "inactive"]
InteractionType = Literal["call", "meeting", "email", "message", "note", "followup"]


# --------------------------------------------------------------------------- #
# Companies
# --------------------------------------------------------------------------- #
class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    logo_url: str | None = Field(default=None, max_length=1024)
    sector: str | None = Field(default=None, max_length=128)
    website: str | None = Field(default=None, max_length=512)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    address: str | None = None
    description: str | None = None
    source: str | None = Field(default=None, max_length=128)
    owner_id: uuid.UUID | None = None
    status: CompanyStatus = "potential"


class CompanyUpdate(BaseModel):
    """Partial update — every field optional; unset fields are left untouched."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    logo_url: str | None = Field(default=None, max_length=1024)
    sector: str | None = Field(default=None, max_length=128)
    website: str | None = Field(default=None, max_length=512)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    address: str | None = None
    description: str | None = None
    source: str | None = Field(default=None, max_length=128)
    owner_id: uuid.UUID | None = None
    status: CompanyStatus | None = None


class CompanyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    logo_url: str | None
    sector: str | None
    website: str | None
    email: str | None
    phone: str | None
    address: str | None
    description: str | None
    source: str | None
    owner_id: uuid.UUID | None
    status: str
    is_active_client: bool
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Contacts
# --------------------------------------------------------------------------- #
class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    photo_url: str | None = Field(default=None, max_length=1024)
    role_title: str | None = Field(default=None, max_length=128)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    notes: str | None = None
    owner_id: uuid.UUID | None = None
    status: ContactStatus = "active"


class ContactUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    photo_url: str | None = Field(default=None, max_length=1024)
    role_title: str | None = Field(default=None, max_length=128)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    notes: str | None = None
    owner_id: uuid.UUID | None = None
    status: ContactStatus | None = None


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    company_id: uuid.UUID | None
    photo_url: str | None
    role_title: str | None
    email: str | None
    phone: str | None
    notes: str | None
    owner_id: uuid.UUID | None
    status: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Interactions
# --------------------------------------------------------------------------- #
class InteractionCreate(BaseModel):
    type: InteractionType
    company_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    opportunity_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    body: str | None = None
    occurred_at: datetime | None = None

    @model_validator(mode="after")
    def _require_link(self) -> InteractionCreate:
        if not any(
            (self.company_id, self.contact_id, self.opportunity_id, self.project_id)
        ):
            raise ValueError(
                "An interaction must link to at least one of: company, contact, "
                "opportunity, project."
            )
        return self


class InteractionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    company_id: uuid.UUID | None
    contact_id: uuid.UUID | None
    opportunity_id: uuid.UUID | None
    project_id: uuid.UUID | None
    body: str | None
    occurred_at: datetime
    user_id: uuid.UUID | None
    created_at: datetime
