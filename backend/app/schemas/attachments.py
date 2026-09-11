"""Schemas for attachment signed-URL upload/download (#46)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# 25 MiB — generous for proposal PDFs / images, small enough to bound abuse.
# audit C2: size_bytes/content_type are client-declared metadata (the actual
# transfer happens directly to R2 via the presigned URL), so this is a
# defense-in-depth bound on what the app will register/sign for, not a
# byte-exact enforcement at the storage layer.
MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024

# Explicit allowlist (audit C2) — deliberately excludes executables, scripts,
# and other types with no legitimate use in this app (proposals, attachments
# on companies/contacts/opportunities/projects/tasks/comments).
ALLOWED_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/svg+xml",
        "text/plain",
        "text/csv",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    }
)


class AttachmentUploadRequest(BaseModel):
    entity_type: str = Field(min_length=1, max_length=64)
    entity_id: uuid.UUID
    filename: str = Field(min_length=1, max_length=512)
    content_type: str | None = Field(default=None, max_length=128)
    size_bytes: int | None = Field(
        default=None, ge=0, le=MAX_ATTACHMENT_SIZE_BYTES
    )


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
