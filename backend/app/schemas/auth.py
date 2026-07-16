"""Pydantic v2 request/response schemas for auth, profile, and invitations."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.permissions import Role

# Minimum password length applied on every place a password is set.
PASSWORD_MIN_LEN = 10
Password = Field(min_length=PASSWORD_MIN_LEN, max_length=128)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access-token lifetime, seconds


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Password


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Password


class MessageResponse(BaseModel):
    message: str


# --------------------------------------------------------------------------- #
# User / profile
# --------------------------------------------------------------------------- #
class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr
    role: str
    status: str
    payments_grant: bool
    invites_grant: bool
    weekly_capacity_hours: float
    avatar_url: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    """Self-service profile edit. Role/status/grants are intentionally NOT here —
    those are privileged mutations handled by admin endpoints (BR-001/BR-004)."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=1024)


# --------------------------------------------------------------------------- #
# Invitations
# --------------------------------------------------------------------------- #
class InvitationCreate(BaseModel):
    email: EmailStr
    role: Role = Role.MEMBRO
    # NOTE: Gestor grant flags (payments/invites, BR-003) are assigned by an
    # admin on the user account after acceptance — the invitations table does
    # not persist grants, so they are intentionally not accepted here.


class InvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    role: str
    status: str
    expires_at: datetime
    created_at: datetime


class InvitationAccept(BaseModel):
    token: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=255)
    password: str = Password
