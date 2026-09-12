"""Schemas for attachment signed-URL upload/download (#46, hardened in #47).

The *policy* (what may be uploaded) lives in
:mod:`app.services.attachment_policy`, not here. These schemas only provide a
cheap first filter — the authoritative decision is made server-side in the
service layer, because every field below is client-supplied and a client can
simply omit an optional one to dodge a schema constraint.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.services.attachment_policy import (
    ALLOWED_CONTENT_TYPES,
    MAX_ATTACHMENT_SIZE_BYTES,
    MAX_FILENAME_LENGTH,
)

__all__ = [
    "ALLOWED_CONTENT_TYPES",
    "MAX_ATTACHMENT_SIZE_BYTES",
    "AttachmentDownloadResponse",
    "AttachmentResponse",
    "AttachmentUploadRequest",
    "AttachmentUploadResponse",
]


class AttachmentUploadRequest(BaseModel):
    entity_type: str = Field(min_length=1, max_length=64)
    entity_id: uuid.UUID
    filename: str = Field(min_length=1, max_length=MAX_FILENAME_LENGTH)
    # Optional because browsers hand us "" for types they cannot sniff. A
    # missing type is NOT a bypass: the service derives the type from the
    # (allowlisted) extension and signs that instead — see attachment_policy.
    content_type: str | None = Field(default=None, max_length=128)
    # Required (#47): when this was optional, omitting it skipped the size cap
    # entirely. The cap is re-checked in the service layer and, decisively, is
    # signed into the presigned PUT as Content-Length.
    size_bytes: int = Field(ge=1, le=MAX_ATTACHMENT_SIZE_BYTES)


class AttachmentUploadResponse(BaseModel):
    attachment_id: uuid.UUID
    key: str
    upload_url: str
    method: str = "PUT"
    expires_in: int
    # The server-decided values baked into the signature. The client MUST send
    # exactly these headers on the PUT or object storage rejects it.
    content_type: str
    content_length: int

    @property
    def required_headers(self) -> dict[str, str]:
        return {
            "Content-Type": self.content_type,
            "Content-Length": str(self.content_length),
        }


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
