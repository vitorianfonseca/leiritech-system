"""Schemas for attachment signed-URL upload/download (#46)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AttachmentUploadRequest(BaseModel):
    entity_type: str = Field(min_length=1, max_length=64)
    entity_id: uuid.UUID
    filename: str = Field(min_length=1, max_length=512)
    content_type: str | None = Field(default=None, max_length=128)
    size_bytes: int | None = Field(default=None, ge=0)


class AttachmentUploadResponse(BaseModel):
    attachment_id: uuid.UUID
    key: str
    upload_url: str
    method: str = "PUT"
    expires_in: int


class AttachmentDownloadResponse(BaseModel):
    download_url: str
    expires_in: int


class AttachmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    filename: str
    mime_type: str | None = None
    size_bytes: int | None = None
    uploaded_by: uuid.UUID | None = None
    created_at: datetime
